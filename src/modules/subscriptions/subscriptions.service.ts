import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { readingExplanations, readings, users, userSettings } from '../../database/drizzle/schema';
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

  /**
   * Devuelve todos los planes de suscripción disponibles y sus límites por nivel.
   */
  getPlans(): SubscriptionPlanItemDto[] {
    return SUBSCRIPTION_TIERS.map((tier) => {
      const plan = SUBSCRIPTION_PLANS[tier];
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        maxCategories: plan.maxCategories,
        allowedLanguages: [...plan.allowedLanguages],
        dailyReadingsLimit: plan.dailyReadingsLimit,
        dailyQuestionsLimit: plan.dailyQuestionsLimit,
      };
    });
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

    // Cantidad de categorías activas configuradas en user_settings
    const settingsRows = await this.db
      .select({ categories: userSettings.preferredCategories })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const categoriesCount = settingsRows[0]?.categories?.length ?? 0;

    // Inicio del día actual en la zona horaria America/Mexico_City
    const startOfDay = getStartOfDayInTimeZone();

    // Lecturas creadas hoy
    const readingsCountResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          gte(readings.createdAt, startOfDay),
          isNull(readings.deletedAt),
        ),
      );
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
      plan: planConfig
        ? {
            id: planConfig.id,
            name: planConfig.name,
            description: planConfig.description,
            maxCategories: planConfig.maxCategories,
            allowedLanguages: [...planConfig.allowedLanguages],
            dailyReadingsLimit: planConfig.dailyReadingsLimit,
            dailyQuestionsLimit: planConfig.dailyQuestionsLimit,
          }
        : null,
      usage: {
        categoriesCount,
        categoriesLimit: planConfig?.maxCategories ?? null,
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
   * Valida si el idioma solicitado está permitido para el plan del usuario.
   */
  async assertLanguageAllowed(userId: number, language: string): Promise<void> {
    const plan = await this.assertSubscriptionActive(userId);
    const lang = language.trim().toLowerCase();
    if (!plan.allowedLanguages.includes(lang)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_LANGUAGE_NOT_ALLOWED, {
        message: `Your current plan '${plan.name}' only allows texts in: ${plan.allowedLanguages.join(', ')}. Upgrade your subscription to access all languages.`,
        plan: plan.id,
        allowedLanguages: plan.allowedLanguages,
        requestedLanguage: language,
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
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          gte(readings.createdAt, startOfDay),
          isNull(readings.deletedAt),
        ),
      );

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
   */
  async recordExplanation(input: {
    readingId: number;
    userId: number;
    word: string;
    context?: string;
    explanation: string;
  }): Promise<void> {
    await this.db.insert(readingExplanations).values({
      readingId: input.readingId,
      userId: input.userId,
      word: input.word,
      context: input.context ?? null,
      explanation: input.explanation,
      createdAt: new Date(),
    });
  }
}
