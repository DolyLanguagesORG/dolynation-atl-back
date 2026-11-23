import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/env.config';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb, DrizzleExecutor } from '../../database/database.module';
import {
  billingSubscriptions,
  readingExplanations,
  readings,
  users,
  userSettings,
} from '../../database/drizzle/schema';
import { AuditLogService } from '../logs';
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
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Optional() private readonly config?: AppConfigService,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

  /** Combina los límites del plan con el precio disponible para la configuración actual. */
  private toPlanDto(plan: SubscriptionPlanConfig): SubscriptionPlanItemDto {
    const provider = this.config?.billing.provider ?? 'manual';
    const currency = this.config?.billing.currency ?? 'mxn';
    const isFree = plan.id === 'dolly';

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      maxCategories: plan.maxCategories,
      maxLanguages: plan.maxLanguages,
      allowedLanguages: [...plan.allowedLanguages],
      dailyReadingsLimit: plan.dailyReadingsLimit,
      dailyQuestionsLimit: plan.dailyQuestionsLimit,
      pricing: {
        isFree,
        checkoutRequired: provider === 'stripe' && !isFree,
        amountCents: isFree ? 0 : null,
        currency,
        interval: isFree ? null : 'month',
      },
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

    let billing: UserSubscriptionResponseDto['billing'] = null;
    if (this.config?.billing.provider === 'stripe') {
      const subRows = await this.db
        .select({
          status: billingSubscriptions.status,
          currentPeriodEnd: billingSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: billingSubscriptions.cancelAtPeriodEnd,
        })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1);
      const sub = subRows[0];
      billing = {
        provider: 'stripe',
        status: sub?.status ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      };
    }

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
      ...(billing ? { billing } : {}),
    };
  }

  /**
   * Permite al usuario seleccionar o cambiar manualmente su nivel de suscripción
   * cuando `ACCESS_REQUESTS_ENABLED` está desactivado o activar el plan gratuito `dolly`
   * cuando Stripe está activo sin suscripción pagada vigente.
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

    if (this.config?.billing.provider === 'stripe') {
      if (tier !== 'dolly') {
        throw new AppHttpException(ErrorCode.BILLING_PAYMENT_REQUIRED, {
          requestType: 'subscription',
          requestedTier: tier,
        });
      }

      const activeStripeSubs = await this.db
        .select({
          id: billingSubscriptions.id,
          status: billingSubscriptions.status,
        })
        .from(billingSubscriptions)
        .where(
          and(
            eq(billingSubscriptions.userId, userId),
            inArray(billingSubscriptions.status, ['active', 'trialing', 'past_due']),
          ),
        )
        .limit(1);

      if (activeStripeSubs[0]) {
        throw new AppHttpException(ErrorCode.BILLING_SUBSCRIPTION_CONFLICT, {
          requestedTier: tier,
          status: activeStripeSubs[0].status,
        });
      }
    } else if (this.config?.accessRequests.enabled) {
      throw new AppHttpException(ErrorCode.ACCESS_REQUEST_REQUIRED, {
        requestType: 'subscription',
        requestedTier: tier,
      });
    }

    let beforeTier: string | null = null;
    if (this.auditLogs) {
      try {
        const beforeRows = await this.db
          .select({ subscriptionTier: users.subscriptionTier })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        beforeTier = beforeRows[0]?.subscriptionTier ?? null;
      } catch {
        beforeTier = null;
      }
    }

    const now = new Date();
    const [updated] = await this.db
      .update(users)
      .set({ subscriptionTier: tier, updatedAt: now })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!updated) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    await this.auditLogs?.logUpdate({
      module: 'subscriptions',
      event: 'subscription.tier_changed',
      entityType: 'users',
      entityId: userId,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Subscription plan updated for user #${userId} (${beforeTier ?? 'none'} -> ${tier})`,
      beforeState: { id: userId, subscriptionTier: beforeTier },
      afterState: { id: userId, subscriptionTier: tier, updatedAt: now },
    });

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
  async assertCanGenerateReading(
    userId: number,
    dbClient: DrizzleExecutor = this.db,
  ): Promise<void> {
    const plan = await this.assertSubscriptionActive(userId);
    if (plan.dailyReadingsLimit === null) {
      return; // Sin límite diario en el plan actual
    }

    const startOfDay = getStartOfDayInTimeZone();
    // Cuenta todas las lecturas generadas hoy, incluso eliminadas lógicamente, para evitar evasión del límite diario
    const result = await dbClient
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
  async assertCanAskQuestion(userId: number, dbClient: DrizzleExecutor = this.db): Promise<void> {
    const plan = await this.assertSubscriptionActive(userId);
    if (plan.dailyQuestionsLimit === null) {
      return; // Sin límite diario en el plan actual
    }

    const startOfDay = getStartOfDayInTimeZone();
    const result = await dbClient
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
  async recordExplanation(
    input: {
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
    },
    dbClient: DrizzleExecutor = this.db,
  ): Promise<ReadingExplanation | undefined> {
    const normalizedWord =
      input.normalizedWord ?? input.word.trim().replace(/\s+/g, ' ').toLowerCase();
    const entryType: ExplanationEntryType =
      input.entryType ?? (normalizedWord.includes(' ') ? 'phrase' : 'word');
    const now = new Date();
    const query = dbClient.insert(readingExplanations).values({
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

    let persisted: ReadingExplanation | undefined;
    if (typeof query.returning === 'function') {
      const rows = await query.returning();
      persisted = rows[0];
    } else {
      await query;
    }

    await this.auditLogs?.logCreate({
      module: 'subscriptions',
      event: 'reading_explanation.created',
      entityType: 'reading_explanations',
      entityId: persisted?.id ?? null,
      actorUserId: input.userId,
      targetUserId: input.userId,
      summary: `Explanation recorded for "${input.word}" on reading #${input.readingId}`,
      afterState: {
        id: persisted?.id ?? null,
        readingId: input.readingId,
        userId: input.userId,
        word: input.word,
        normalizedWord,
        entryType,
        language: input.language ?? 'en',
        difficulty: input.difficulty ?? 'medium',
        isSaved: persisted?.isSaved ?? false,
      },
    });

    return persisted;
  }
}
