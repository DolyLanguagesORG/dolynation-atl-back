import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { readingExplanations, readings, users, userSettings } from '../../database/drizzle/schema';
import type {
  AlternativeExpressionItem,
  ExplanationEntryType,
  ReadingExplanation,
  UsageContextItem,
  WordBreakdownItem,
} from '../../database/drizzle/types';
import { isSupportedLanguageId, SUPPORTED_LANGUAGE_IDS } from '../settings/settings.constants';
import {
  resolveActiveLanguages,
  sanitizeSelectedLanguages,
} from '../settings/language-selection.helpers';
import {
  getStartOfDayInTimeZone,
  isValidSubscriptionTier,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_TIERS,
  type SubscriptionPlanConfig,
  type SubscriptionTier,
} from './subscriptions.constants';
import type { SubscriptionPlanItemDto } from './dto/subscription-plan-response.dto';
import type { UserSubscriptionResponseDto } from './dto/user-subscription-response.dto';

/**
 * Servicio encargado de consultar planes, medir consumo diario y hacer cumplir las cuotas de suscripción.
 */
@Injectable()
export class SubscriptionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  private toPlanDto(plan: SubscriptionPlanConfig): SubscriptionPlanItemDto {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      maxCategories: plan.maxCategories,
      maxLanguages: plan.maxLanguages,
      allowedLanguages: [...plan.allowedLanguages],
      dailyReadingsLimit: plan.dailyReadingsLimit,
      dailyQuestionsLimit: plan.dailyQuestionsLimit,
    };
  }

  /**
   * Devuelve todos los planes de suscripción disponibles y sus límites por nivel.
   */
  getPlans(): SubscriptionPlanItemDto[] {
    return SUBSCRIPTION_TIERS.map((tier) => this.toPlanDto(SUBSCRIPTION_PLANS[tier]));
  }

  /**
   * Obtiene la configuración de un plan para un nivel determinado.
   */
  getPlan(tier: SubscriptionTier): SubscriptionPlanConfig {
    return SUBSCRIPTION_PLANS[tier];
  }

  /**
   * Obtiene el estado de suscripción del usuario, el detalle del plan actual y sus contadores de uso diario.
   */
  async getUserSubscription(userId: number): Promise<UserSubscriptionResponseDto> {
    const userRows = await this.db
      .select({ id: users.id, subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    const rawTier = user.subscriptionTier;
    const tier: SubscriptionTier | null = isValidSubscriptionTier(rawTier) ? rawTier : null;
    const planConfig = tier ? SUBSCRIPTION_PLANS[tier] : null;

    // Cantidad de categorías e idiomas activos configurados en user_settings
    const settingsRows = await this.db
      .select({
        categories: userSettings.preferredCategories,
        selectedLanguages: userSettings.selectedLanguages,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const categoriesCount = settingsRows[0]?.categories?.length ?? 0;
    const savedLanguages = sanitizeSelectedLanguages(settingsRows[0]?.selectedLanguages);
    const activeLanguages = planConfig
      ? resolveActiveLanguages(savedLanguages, planConfig.maxLanguages)
      : [];

    // Inicio del día actual en la zona horaria America/Mexico_City
    const startOfDay = getStartOfDayInTimeZone();

    // Lecturas creadas hoy (incluye eliminadas lógicamente para impedir reinicio manual del cupo diario)
    const readingsCountResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readings)
      .where(and(eq(readings.userId, userId), gte(readings.createdAt, startOfDay)));
    const readingsCreatedToday = readingsCountResult[0]?.count ?? 0;

    // Preguntas o explicaciones solicitadas hoy
    const questionsCountResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readingExplanations)
      .where(
        and(eq(readingExplanations.userId, userId), gte(readingExplanations.createdAt, startOfDay)),
      );
    const questionsAskedToday = questionsCountResult[0]?.count ?? 0;

    const readingsLimit = planConfig?.dailyReadingsLimit ?? null;
    const readingsRemainingToday =
      readingsLimit !== null ? Math.max(0, readingsLimit - readingsCreatedToday) : null;

    const questionsLimit = planConfig?.dailyQuestionsLimit ?? null;
    const questionsRemainingToday =
      questionsLimit !== null ? Math.max(0, questionsLimit - questionsAskedToday) : null;

    return {
      hasSubscription: tier !== null,
      tier,
      plan: planConfig ? this.toPlanDto(planConfig) : null,
      usage: {
        categoriesCount,
        categoriesLimit: planConfig?.maxCategories ?? null,
        languagesCount: activeLanguages.length,
        languagesLimit: planConfig?.maxLanguages ?? null,
        readingsCreatedToday,
        readingsLimit,
        readingsRemainingToday,
        questionsAskedToday,
        questionsLimit,
        questionsRemainingToday,
      },
    };
  }

  /**
   * Permite al usuario seleccionar o cambiar manualmente su nivel de suscripción.
   */
  async selectSubscription(
    userId: number,
    tier: SubscriptionTier,
  ): Promise<UserSubscriptionResponseDto> {
    if (!isValidSubscriptionTier(tier)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_INVALID_TIER, {
        tier,
        validTiers: SUBSCRIPTION_TIERS,
      });
    }

    const [updated] = await this.db
      .update(users)
      .set({ subscriptionTier: tier, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!updated) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    return this.getUserSubscription(userId);
  }

  /**
   * Exige que el usuario tenga un plan de suscripción activo seleccionado.
   * Lanza `403 SUBSCRIPTION_REQUIRED` si el usuario no cuenta con suscripción.
   */
  async assertSubscriptionActive(userId: number): Promise<SubscriptionPlanConfig> {
    const userRows = await this.db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    if (!user.subscriptionTier || !isValidSubscriptionTier(user.subscriptionTier)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_REQUIRED, {
        message:
          'You must choose a subscription plan (dolly, dolly_plus, or dolly_pro) to access this feature.',
      });
    }

    return SUBSCRIPTION_PLANS[user.subscriptionTier];
  }

  /**
   * Valida si la cantidad de categorías candidatas respeta el límite del plan del usuario.
   */
  async assertCategoryLimit(userId: number, candidateCount: number): Promise<void> {
    const plan = await this.assertSubscriptionActive(userId);
    if (plan.maxCategories !== null && candidateCount > plan.maxCategories) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_CATEGORY_LIMIT_EXCEEDED, {
        message: `Plan '${plan.name}' allows at most ${plan.maxCategories} categories. You tried to configure ${candidateCount}.`,
        plan: plan.id,
        maxCategories: plan.maxCategories,
        requestedCount: candidateCount,
      });
    }
  }

  /**
   * Valida que el idioma solicitado sea válido para el sistema, haya sido elegido por el usuario
   * en su perfil/configuración y pertenezca a los cupos activos de su suscripción.
   */
  async assertLanguageAllowed(userId: number, language: string): Promise<void> {
    const plan = await this.assertSubscriptionActive(userId);
    const lang = language.trim().toLowerCase();

    if (!isSupportedLanguageId(lang) || !plan.allowedLanguages.includes(lang)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_LANGUAGE_NOT_ALLOWED, {
        message: `Language '${language}' is not supported. Supported languages: ${plan.allowedLanguages.join(', ')}.`,
        plan: plan.id,
        allowedLanguages: plan.allowedLanguages,
        maxLanguages: plan.maxLanguages,
        requestedLanguage: language,
      });
    }

    // Los planes con acceso total a los 4 idiomas (dolly_pro) no requieren selección ni bloqueo previo
    if (plan.maxLanguages >= SUPPORTED_LANGUAGE_IDS.length) {
      return;
    }

    const settingsRows = await this.db
      .select({ selectedLanguages: userSettings.selectedLanguages })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const savedLanguages = sanitizeSelectedLanguages(settingsRows[0]?.selectedLanguages);
    if (savedLanguages.length === 0) {
      throw new AppHttpException(ErrorCode.LANGUAGE_NOT_SELECTED, {
        message: `You must select up to ${plan.maxLanguages} study language(s) in settings before generating readings.`,
        plan: plan.id,
        maxLanguages: plan.maxLanguages,
        allowedLanguages: plan.allowedLanguages,
        requestedLanguage: lang,
      });
    }

    const activeLanguages = resolveActiveLanguages(savedLanguages, plan.maxLanguages);
    if (!activeLanguages.includes(lang)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_LANGUAGE_NOT_ALLOWED, {
        message: `Language '${lang}' is not among your active selected languages (${activeLanguages.join(', ')}) allowed by plan '${plan.name}' (limit: ${plan.maxLanguages}).`,
        plan: plan.id,
        maxLanguages: plan.maxLanguages,
        activeLanguages,
        configuredLanguages: savedLanguages,
        requestedLanguage: lang,
      });
    }
  }

  /**
   * Valida si el usuario aún dispone de cuota diaria para generar una nueva lectura hoy.
   */
  async assertCanGenerateReading(userId: number): Promise<void> {
    const plan = await this.assertSubscriptionActive(userId);
    if (plan.dailyReadingsLimit === null) {
      return; // Sin límite diario en el plan actual
    }

    const startOfDay = getStartOfDayInTimeZone();
    // Cuenta todas las lecturas generadas hoy, incluso eliminadas lógicamente, para evitar evasión del límite diario
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readings)
      .where(and(eq(readings.userId, userId), gte(readings.createdAt, startOfDay)));

    const used = result[0]?.count ?? 0;
    if (used >= plan.dailyReadingsLimit) {
      throw new AppHttpException(ErrorCode.READING_DAILY_LIMIT_REACHED, {
        message: `You have reached your daily limit of ${plan.dailyReadingsLimit} readings for plan '${plan.name}'. Come back tomorrow or upgrade your plan.`,
        plan: plan.id,
        limit: plan.dailyReadingsLimit,
        used,
      });
    }
  }

  /**
   * Valida si el usuario aún dispone de cuota diaria para solicitar explicaciones hoy.
   */
  async assertCanAskQuestion(userId: number): Promise<void> {
    const plan = await this.assertSubscriptionActive(userId);
    if (plan.dailyQuestionsLimit === null) {
      return; // Sin límite diario en el plan actual
    }

    const startOfDay = getStartOfDayInTimeZone();
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readingExplanations)
      .where(
        and(eq(readingExplanations.userId, userId), gte(readingExplanations.createdAt, startOfDay)),
      );

    const used = result[0]?.count ?? 0;
    if (used >= plan.dailyQuestionsLimit) {
      throw new AppHttpException(ErrorCode.EXPLANATION_DAILY_LIMIT_REACHED, {
        message: `You have reached your daily limit of ${plan.dailyQuestionsLimit} questions for plan '${plan.name}'. Come back tomorrow or upgrade your plan.`,
        plan: plan.id,
        limit: plan.dailyQuestionsLimit,
        used,
      });
    }
  }

  /**
   * Registra una consulta de explicación sobre una lectura en `reading_explanations`.
   * Acepta metadatos estructurados para la ayuda contextual y el glosario persistente.
   */
  async recordExplanation(input: {
    readingId: number;
    userId: number;
    word: string;
    normalizedWord?: string;
    entryType?: ExplanationEntryType;
    language?: string;
    difficulty?: string;
    context?: string;
    literalMeaning?: string | null;
    explanation: string;
    wordBreakdown?: WordBreakdownItem[];
    otherWaysToSay?: AlternativeExpressionItem[];
    otherContexts?: UsageContextItem[];
  }): Promise<ReadingExplanation | undefined> {
    const normalizedWord =
      input.normalizedWord ?? input.word.trim().replace(/\s+/g, ' ').toLowerCase();
    const entryType: ExplanationEntryType =
      input.entryType ?? (normalizedWord.includes(' ') ? 'phrase' : 'word');
    const now = new Date();
    const query = this.db.insert(readingExplanations).values({
      readingId: input.readingId,
      userId: input.userId,
      word: input.word,
      normalizedWord,
      entryType,
      language: input.language ?? 'en',
      difficulty: input.difficulty ?? 'medium',
      context: input.context ?? null,
      literalMeaning: input.literalMeaning ?? null,
      explanation: input.explanation,
      wordBreakdown: input.wordBreakdown ?? [],
      otherWaysToSay: input.otherWaysToSay ?? [],
      otherContexts: input.otherContexts ?? [],
      createdAt: now,
      updatedAt: now,
    }) as unknown as {
      returning?: () => Promise<ReadingExplanation[]>;
    } & Promise<unknown>;

    if (typeof query.returning === 'function') {
      const rows = await query.returning();
      return rows[0];
    }

    await query;
    return undefined;
  }
}
