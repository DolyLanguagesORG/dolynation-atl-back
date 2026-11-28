import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { desc, eq, and, isNull, ne, or, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/env.config';
import type { DrizzleDb } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  billingPayments,
  billingSubscriptions,
  billingWebhookEvents,
  users,
  userSettings,
} from '../../database/drizzle/schema';
import type { BillingPayment, BillingSubscription } from '../../database/drizzle/types';
import { AuditLogService, ErrorLogService } from '../logs';
import { SettingsService } from '../settings/settings.service';
import {
  isValidSubscriptionTier,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from '../subscriptions/subscriptions.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { BillingRateLimitService } from './billing-rate-limit.service';
import {
  CHECKOUT_IDEMPOTENCY_BUCKET_MS,
  DEFAULT_INVOICES_LIMIT,
  isActiveSubscriptionStatus,
  isPaidSubscriptionTier,
  MAX_INVOICES_LIMIT,
  MAX_WEBHOOK_PAYLOAD_BYTES,
  NON_ENTITLING_STRIPE_SUBSCRIPTION_STATUSES,
  PAYMENT_GATEWAY,
  PRICE_CACHE_TTL_MS,
  resolvePriceIdForTier,
  resolveTierForPriceId,
  STALE_WEBHOOK_PROCESSING_MS,
  type PaidSubscriptionTier,
} from './billing.constants';
import type {
  BillingConfigResponseDto,
  BillingPlanPricingDto,
} from './dto/billing-config-response.dto';
import type { BillingInvoiceDto } from './dto/billing-invoice-response.dto';
import type { BillingPortalResponseDto } from './dto/billing-portal-response.dto';
import type {
  BillingPaymentMethodSummaryDto,
  BillingRecentPaymentDto,
  BillingStatusResponseDto,
  BillingSubscriptionSummaryDto,
} from './dto/billing-status-response.dto';
import type { ChangePlanDto } from './dto/change-plan.dto';
import type { CheckoutSessionResponseDto } from './dto/checkout-session-response.dto';
import type { CreateLanguageUnlockCheckoutDto } from './dto/create-language-unlock-checkout.dto';
import type { CreateSubscriptionCheckoutDto } from './dto/create-subscription-checkout.dto';
import type { SetDefaultPaymentMethodDto } from './dto/set-default-payment-method.dto';
import type { SetupIntentResponseDto } from './dto/setup-intent-response.dto';
import type { WebhookProcessedResponseDto } from './dto/webhook-response.dto';
import type {
  GatewayCheckoutSession,
  GatewayInvoice,
  GatewayPaymentMethodSummary,
  GatewayPriceInfo,
  GatewayRefund,
  GatewaySubscription,
  PaymentGateway,
} from './gateway/payment-gateway.interface';

interface CachedPriceEntry {
  value: GatewayPriceInfo;
  expiresAt: number;
}

interface BillingCustomerUser {
  id: number;
  email: string;
  fullName: string | null;
  locale: string;
  subscriptionTier: string | null;
  stripeCustomerId: string | null;
  createdAt?: Date | string | null;
}

/** Convierte metadatos de Stripe a un ID local solo si son enteros positivos. */
function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Valida el formato esperado para los identificadores de sesión de Stripe Checkout. */
const CHECKOUT_SESSION_ID_REGEX = /^cs_[A-Za-z0-9_]{3,128}$/;
/** Caracteres y longitud permitidos en claves de idempotencia recibidas por HTTP. */
const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Servicio central de pagos, checkout, gestión in-app de suscripciones, métodos de pago,
 * facturas e idempotencia de webhooks para DolyNation.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly priceCache = new Map<string, CachedPriceEntry>();
  private readonly priceInFlight = new Map<string, Promise<GatewayPriceInfo | null>>();
  // M-4: los bloqueos en memoria (`customerLocks` / `userMutationLocks`) serializan
  // ráfagas dentro de una réplica única; la unicidad en PostgreSQL, los idempotency keys
  // de Stripe y la verificación `listActiveSubscriptions` protegen el estado monetario.
  // Si se escala horizontalmente a >1 réplica, migrar este mutex a `pg_advisory_xact_lock` o Redis.
  private readonly customerLocks = new Map<
    number,
    Promise<{
      user: BillingCustomerUser;
      customerId: string;
    }>
  >();
  private readonly userMutationLocks = new Map<string, Promise<void>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: AppConfigService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly settings: SettingsService,
    private readonly subscriptions: SubscriptionsService,
    @Optional() private readonly auditLogs?: AuditLogService,
    @Optional() private readonly errorLogs?: ErrorLogService,
    @Optional() private readonly rateLimiter?: BillingRateLimitService,
  ) {}

  /** Impide operaciones de pago cuando el proveedor configurado no es Stripe. */
  private ensureStripeEnabled(): void {
    if (this.config.billing.provider !== 'stripe') {
      throw new AppHttpException(ErrorCode.BILLING_NOT_CONFIGURED);
    }
  }

  /** Devuelve la clave publicable requerida por Stripe.js o informa que falta configuración. */
  private getPublishableKeyOrThrow(): string {
    const key = this.config.billing.stripe.publishableKey;
    if (!key) {
      throw new AppHttpException(ErrorCode.BILLING_NOT_CONFIGURED);
    }
    return key;
  }

  /** Normaliza la URL base del frontend para construir enlaces de retorno sin barras finales. */
  private getFrontendBaseUrl(): string {
    return this.config.mail.frontendBaseUrl.replace(/\/+$/, '');
  }

  /** Valida y delimita una clave de idempotencia al usuario, entorno y operación. */
  private buildScopedIdempotencyKey(
    userId: number,
    operation: string,
    rawKey: string | undefined,
  ): string | undefined {
    if (!rawKey) return undefined;
    const trimmed = rawKey.trim();
    if (!trimmed) return undefined;
    if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        fields: [
          {
            field: 'idempotency-key',
            message: 'Idempotency-Key must contain 1-128 alphanumeric or ._:- characters',
          },
        ],
      });
    }
    return `doly:${this.config.billing.envTag}:u${userId}:${operation}:${trimmed}`;
  }

  /**
   * M-5: garantiza una idempotency key en todo Checkout aunque el cliente no envíe cabecera,
   * derivando una clave determinista por ventana temporal para absorber reintentos de red.
   */
  private resolveCheckoutIdempotencyKey(
    userId: number,
    operation: 'checkout_sub' | 'checkout_unlock',
    discriminator: string,
    rawKey: string | undefined,
  ): string {
    const scoped = this.buildScopedIdempotencyKey(userId, operation, rawKey);
    if (scoped) {
      return scoped;
    }
    const bucket = Math.floor(Date.now() / CHECKOUT_IDEMPOTENCY_BUCKET_MS);
    return `doly:${this.config.billing.envTag}:u${userId}:${operation}:auto:${discriminator}:b${bucket}`;
  }

  /** Serializa mutaciones concurrentes dentro de la réplica actual (M-4). */
  private async withUserLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.userMutationLocks.get(lockKey) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => gate);
    this.userMutationLocks.set(lockKey, chain);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.userMutationLocks.get(lockKey) === chain) {
        this.userMutationLocks.delete(lockKey);
      }
    }
  }

  /** Reutiliza precios cacheados y agrupa consultas simultáneas al mismo price ID. */
  private async getCachedPriceInfo(priceId: string | undefined): Promise<GatewayPriceInfo | null> {
    if (!priceId || this.config.billing.provider !== 'stripe') {
      return null;
    }

    const now = Date.now();
    const cached = this.priceCache.get(priceId);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const existingFlight = this.priceInFlight.get(priceId);
    if (existingFlight) {
      return existingFlight;
    }

    const request = (async (): Promise<GatewayPriceInfo | null> => {
      try {
        const value = await this.gateway.retrievePrice(priceId);
        this.priceCache.set(priceId, { value, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
        return value;
      } catch (error) {
        this.logger.warn(
          `Could not retrieve Stripe price '${priceId}': ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      } finally {
        this.priceInFlight.delete(priceId);
      }
    })();

    this.priceInFlight.set(priceId, request);
    return request;
  }

  /** Comparte entre llamadas simultáneas la resolución o creación del cliente Stripe del usuario. */
  private async getOrCreateCustomerId(userId: number): Promise<{
    user: BillingCustomerUser;
    customerId: string;
  }> {
    const inFlight = this.customerLocks.get(userId);
    if (inFlight) {
      return inFlight;
    }

    const task = this.resolveOrCreateCustomerId(userId).finally(() => {
      if (this.customerLocks.get(userId) === task) {
        this.customerLocks.delete(userId);
      }
    });
    this.customerLocks.set(userId, task);
    return task;
  }

  /** Recupera al usuario y crea su cliente Stripe si todavía no tiene uno asociado. */
  private async resolveOrCreateCustomerId(userId: number): Promise<{
    user: BillingCustomerUser;
    customerId: string;
  }> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        locale: users.locale,
        subscriptionTier: users.subscriptionTier,
        stripeCustomerId: users.stripeCustomerId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    if (user.stripeCustomerId) {
      return { user, customerId: user.stripeCustomerId };
    }

    // B-8: incluimos huella de email + marca temporal de creación para evitar colisiones en Stripe
    // si una cuenta es eliminada y se reasigna un mismo ID dentro de la ventana de 24 h.
    const createdAtToken =
      user.createdAt instanceof Date
        ? String(user.createdAt.getTime())
        : typeof user.createdAt === 'string'
          ? user.createdAt
          : 'no-ts';
    const customerFingerprint = createHash('sha256')
      .update(`${user.email.trim().toLowerCase()}:${createdAtToken}`)
      .digest('hex')
      .slice(0, 12);

    const created = await this.gateway.createCustomer({
      email: user.email,
      name: user.fullName,
      metadata: {
        userId: String(user.id),
        env: this.config.billing.envTag,
      },
      idempotencyKey: `doly-cust-${this.config.billing.envTag}-${user.id}-${customerFingerprint}`,
    });

    const updatedRows = await this.db
      .update(users)
      .set({ stripeCustomerId: created.id, updatedAt: new Date() })
      .where(and(eq(users.id, user.id), isNull(users.stripeCustomerId)))
      .returning({ stripeCustomerId: users.stripeCustomerId });

    if (updatedRows[0]?.stripeCustomerId) {
      return { user, customerId: updatedRows[0].stripeCustomerId };
    }

    const freshRows = await this.db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    return { user, customerId: freshRows[0]?.stripeCustomerId ?? created.id };
  }

  /**
   * Devuelve la configuración pública de facturación (clave pública, moneda, modo UI y precios).
   */
  async getPublicConfig(): Promise<BillingConfigResponseDto> {
    const { provider, currency, checkoutUiMode, stripe } = this.config.billing;

    const [dollyPlusPrice, dollyProPrice, unlockPrice] = await Promise.all([
      this.getCachedPriceInfo(stripe.prices.dollyPlus),
      this.getCachedPriceInfo(stripe.prices.dollyPro),
      this.getCachedPriceInfo(stripe.prices.languageUnlock),
    ]);

    const plans: BillingPlanPricingDto[] = SUBSCRIPTION_TIERS.map((tier) => {
      if (tier === 'dolly') {
        return {
          tier,
          isFree: true,
          checkoutRequired: false,
          amountCents: 0,
          currency,
          interval: null,
        };
      }

      const priceInfo = tier === 'dolly_plus' ? dollyPlusPrice : dollyProPrice;
      return {
        tier,
        isFree: false,
        checkoutRequired: provider === 'stripe',
        amountCents: priceInfo?.unitAmount ?? null,
        currency: priceInfo?.currency ?? currency,
        interval: priceInfo?.interval ?? 'month',
      };
    });

    return {
      provider,
      publishableKey: stripe.publishableKey ?? null,
      currency,
      uiMode: checkoutUiMode,
      plans,
      languageUnlock: {
        checkoutRequired: provider === 'stripe',
        amountCents: unlockPrice?.unitAmount ?? null,
        currency: unlockPrice?.currency ?? currency,
      },
    };
  }

  /**
   * Inicia un Checkout Session de suscripción (`dolly_plus` o `dolly_pro`) evitando duplicados activos.
   */
  async createSubscriptionCheckout(
    userId: number,
    dto: CreateSubscriptionCheckoutDto,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResponseDto> {
    this.ensureStripeEnabled();
    const publishableKey = this.getPublishableKeyOrThrow();

    if (!isPaidSubscriptionTier(dto.tier)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_INVALID_TIER, {
        tier: dto.tier,
      });
    }

    const priceId = resolvePriceIdForTier(dto.tier, this.config);
    if (!priceId) {
      throw new AppHttpException(ErrorCode.BILLING_NOT_CONFIGURED);
    }

    const uiMode = dto.uiMode ?? this.config.billing.checkoutUiMode;
    const resolvedIdempotencyKey = this.resolveCheckoutIdempotencyKey(
      userId,
      'checkout_sub',
      `${dto.tier}:${uiMode}`,
      idempotencyKey,
    );
    this.rateLimiter?.assertWithinLimit(userId, 'checkout');

    return this.withUserLock(`checkout:${userId}`, async () => {
      const existingSubRows = await this.db
        .select({
          id: billingSubscriptions.id,
          status: billingSubscriptions.status,
        })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1);

      const existingSub = existingSubRows[0];
      if (existingSub && isActiveSubscriptionStatus(existingSub.status)) {
        throw new AppHttpException(ErrorCode.BILLING_SUBSCRIPTION_CONFLICT, {
          currentStatus: existingSub.status,
          requestedTier: dto.tier,
        });
      }

      const { user, customerId } = await this.getOrCreateCustomerId(userId);

      // Se pregunta a la pasarela, no solo a la base local. La base solo
      // refleja lo que han contado los webhooks: si uno se perdio (evento
      // atascado, despliegue a mitad), la base diria que el usuario no tiene
      // suscripcion y se crearia una segunda. Stripe admite varias
      // suscripciones por cliente, asi que el usuario acabaria pagando dos.
      const activeInProvider = await this.gateway.listActiveSubscriptions({ customerId });
      if (activeInProvider.length > 0) {
        throw new AppHttpException(ErrorCode.BILLING_SUBSCRIPTION_CONFLICT, {
          currentStatus: activeInProvider[0].status,
          requestedTier: dto.tier,
        });
      }

      const frontendBase = this.getFrontendBaseUrl();
      const metadata: Record<string, string> = {
        userId: String(userId),
        tier: dto.tier,
        kind: 'subscription',
        env: this.config.billing.envTag,
      };

      const session = await this.gateway.createCheckoutSession({
        customerId,
        mode: 'subscription',
        priceId,
        uiMode,
        locale: user.locale,
        returnUrl: `${frontendBase}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
        successUrl: `${frontendBase}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${frontendBase}/profile#subscription`,
        metadata,
        subscriptionMetadata: {
          userId: String(userId),
          tier: dto.tier,
          env: this.config.billing.envTag,
        },
        idempotencyKey: resolvedIdempotencyKey,
      });

      await this.auditLogs?.logEvent({
        module: 'billing',
        action: 'ACTION',
        event: 'billing.checkout_subscription_created',
        entityType: 'billing_checkout_session',
        entityId: session.id,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Subscription checkout session created for user #${userId} (${dto.tier})`,
        metadata: { tier: dto.tier, uiMode, sessionId: session.id },
      });

      return {
        sessionId: session.id,
        clientSecret: session.clientSecret,
        url: session.url,
        publishableKey,
        uiMode,
        tier: dto.tier,
      };
    });
  }

  /**
   * Inicia un Checkout Session de pago único para acreditar +1 cambio de idioma.
   */
  async createLanguageUnlockCheckout(
    userId: number,
    dto: CreateLanguageUnlockCheckoutDto,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResponseDto> {
    this.ensureStripeEnabled();
    const publishableKey = this.getPublishableKeyOrThrow();

    const priceId = this.config.billing.stripe.prices.languageUnlock;
    if (!priceId) {
      throw new AppHttpException(ErrorCode.BILLING_NOT_CONFIGURED);
    }

    const uiMode = dto.uiMode ?? this.config.billing.checkoutUiMode;
    const resolvedIdempotencyKey = this.resolveCheckoutIdempotencyKey(
      userId,
      'checkout_unlock',
      uiMode,
      idempotencyKey,
    );
    this.rateLimiter?.assertWithinLimit(userId, 'checkout');

    return this.withUserLock(`checkout:${userId}`, async () => {
      await this.subscriptions.assertSubscriptionActive(userId);

      const { user, customerId } = await this.getOrCreateCustomerId(userId);
      const frontendBase = this.getFrontendBaseUrl();
      const metadata: Record<string, string> = {
        userId: String(userId),
        kind: 'language_unlock',
        env: this.config.billing.envTag,
      };

      const session = await this.gateway.createCheckoutSession({
        customerId,
        mode: 'payment',
        priceId,
        uiMode,
        locale: user.locale,
        returnUrl: `${frontendBase}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
        successUrl: `${frontendBase}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${frontendBase}/profile#preferences`,
        metadata,
        idempotencyKey: resolvedIdempotencyKey,
      });

      const now = new Date();
      await this.db
        .insert(billingPayments)
        .values({
          userId,
          provider: 'stripe',
          kind: 'language_unlock',
          tier: null,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: session.paymentIntentId,
          amountCents: session.amountTotal ?? 0,
          currency: session.currency ?? this.config.billing.currency,
          status: 'pending',
          metadata,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: billingPayments.stripeCheckoutSessionId });

      await this.auditLogs?.logEvent({
        module: 'billing',
        action: 'ACTION',
        event: 'billing.checkout_language_unlock_created',
        entityType: 'billing_checkout_session',
        entityId: session.id,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Language unlock checkout session created for user #${userId}`,
        metadata: { uiMode, sessionId: session.id },
      });

      return {
        sessionId: session.id,
        clientSecret: session.clientSecret,
        url: session.url,
        publishableKey,
        uiMode,
        tier: null,
      };
    });
  }

  /**
   * Reconcilia de forma síncrona e idempotente una Checkout Session tras volver del flujo de pago.
   */
  async syncCheckoutSession(userId: number, sessionId: string): Promise<BillingStatusResponseDto> {
    this.ensureStripeEnabled();
    const trimmedSessionId = sessionId.trim();
    if (!CHECKOUT_SESSION_ID_REGEX.test(trimmedSessionId)) {
      throw new AppHttpException(ErrorCode.BILLING_CHECKOUT_INVALID, {
        sessionId: trimmedSessionId,
      });
    }
    this.rateLimiter?.assertWithinLimit(userId, 'sync');

    const session = await this.gateway.retrieveCheckoutSession(trimmedSessionId);
    const metaUserId = parsePositiveInt(session.metadata['userId']);
    if (metaUserId !== null && metaUserId !== userId) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
        resource: 'CheckoutSession',
      });
    }

    if (session.metadata['env'] && session.metadata['env'] !== this.config.billing.envTag) {
      throw new AppHttpException(ErrorCode.BILLING_CHECKOUT_INVALID, {
        sessionId: trimmedSessionId,
      });
    }

    if (metaUserId === null) {
      const userRows = await this.db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!userRows[0]?.stripeCustomerId || userRows[0].stripeCustomerId !== session.customerId) {
        throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
          resource: 'CheckoutSession',
        });
      }
    }

    await this.fulfillCheckoutSession(session, userId, true);
    return this.getBillingStatus(userId);
  }

  /**
   * Consulta el estado actual de suscripción Stripe y pagos recientes del usuario.
   */
  async getBillingStatus(userId: number): Promise<BillingStatusResponseDto> {
    this.rateLimiter?.assertWithinLimit(userId, 'status');

    const userRows = await this.db
      .select({ id: users.id, subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    const [subRows, paymentRows] = await Promise.all([
      this.db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1),
      this.db
        .select()
        .from(billingPayments)
        .where(eq(billingPayments.userId, userId))
        .orderBy(desc(billingPayments.createdAt), desc(billingPayments.id))
        .limit(10),
    ]);

    const tier: SubscriptionTier | null = isValidSubscriptionTier(user.subscriptionTier)
      ? user.subscriptionTier
      : null;

    return {
      provider: this.config.billing.provider,
      tier,
      subscription: subRows[0] ? this.toSubscriptionSummaryDto(subRows[0]) : null,
      recentPayments: paymentRows.map((p) => this.toRecentPaymentDto(p)),
    };
  }

  /**
   * Cambia de plan pagado (`dolly_plus` ↔ `dolly_pro`) in-app con prorrateo en Stripe.
   */
  async changePlan(
    userId: number,
    dto: ChangePlanDto,
    idempotencyKey?: string,
  ): Promise<BillingStatusResponseDto> {
    this.ensureStripeEnabled();

    if (!isPaidSubscriptionTier(dto.tier)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_INVALID_TIER, {
        tier: dto.tier,
      });
    }

    const newPriceId = resolvePriceIdForTier(dto.tier, this.config);
    if (!newPriceId) {
      throw new AppHttpException(ErrorCode.BILLING_NOT_CONFIGURED);
    }

    const scopedIdempotencyKey = this.buildScopedIdempotencyKey(
      userId,
      'change_plan',
      idempotencyKey,
    );
    this.rateLimiter?.assertWithinLimit(userId, 'mutation');

    return this.withUserLock(`sub:${userId}`, async () => {
      const subRows = await this.db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1);

      const existing = subRows[0];
      if (!existing || !isActiveSubscriptionStatus(existing.status)) {
        throw new AppHttpException(ErrorCode.BILLING_PAYMENT_REQUIRED, {
          action: 'checkout_required',
          targetTier: dto.tier,
        });
      }

      if (existing.status === 'past_due') {
        throw new AppHttpException(ErrorCode.BILLING_PAYMENT_REQUIRED, {
          reason: 'subscription_past_due',
          currentStatus: existing.status,
          targetTier: dto.tier,
        });
      }

      // M-6: cambiar de plan no debe alterar una cancelación programada; si ya está en
      // el mismo nivel, se devuelve el estado actual sin tocar `cancel_at_period_end`.
      if (existing.tier === dto.tier) {
        return this.getBillingStatus(userId);
      }

      const updated = await this.gateway.updateSubscriptionPlan({
        subscriptionId: existing.stripeSubscriptionId,
        newPriceId,
        metadata: {
          userId: String(userId),
          tier: dto.tier,
          env: this.config.billing.envTag,
        },
        ...(scopedIdempotencyKey ? { idempotencyKey: scopedIdempotencyKey } : {}),
      });

      await this.syncSubscriptionState(updated, userId, dto.tier);
      return this.getBillingStatus(userId);
    });
  }

  /**
   * Programa la cancelación de la suscripción pagada al final del periodo actual in-app.
   */
  async cancelSubscription(userId: number): Promise<BillingStatusResponseDto> {
    this.ensureStripeEnabled();
    this.rateLimiter?.assertWithinLimit(userId, 'mutation');

    return this.withUserLock(`sub:${userId}`, async () => {
      const subRows = await this.db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1);

      const existing = subRows[0];
      if (!existing || !isActiveSubscriptionStatus(existing.status)) {
        throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, {
          resource: 'Subscription',
        });
      }

      if (existing.cancelAtPeriodEnd) {
        return this.getBillingStatus(userId);
      }

      const updated = await this.gateway.setSubscriptionCancelAtPeriodEnd({
        subscriptionId: existing.stripeSubscriptionId,
        cancelAtPeriodEnd: true,
      });

      const tierHint = isValidSubscriptionTier(existing.tier) ? existing.tier : undefined;
      await this.syncSubscriptionState(updated, userId, tierHint);
      return this.getBillingStatus(userId);
    });
  }

  /**
   * Reactiva in-app una suscripción programada para cancelarse al cierre del periodo.
   */
  async resumeSubscription(userId: number): Promise<BillingStatusResponseDto> {
    this.ensureStripeEnabled();
    this.rateLimiter?.assertWithinLimit(userId, 'mutation');

    return this.withUserLock(`sub:${userId}`, async () => {
      const subRows = await this.db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1);

      const existing = subRows[0];
      if (!existing || (existing.status !== 'active' && existing.status !== 'trialing')) {
        throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, {
          resource: 'Subscription',
        });
      }

      if (!existing.cancelAtPeriodEnd) {
        return this.getBillingStatus(userId);
      }

      const updated = await this.gateway.setSubscriptionCancelAtPeriodEnd({
        subscriptionId: existing.stripeSubscriptionId,
        cancelAtPeriodEnd: false,
      });

      const tierHint = isValidSubscriptionTier(existing.tier) ? existing.tier : undefined;
      await this.syncSubscriptionState(updated, userId, tierHint);
      return this.getBillingStatus(userId);
    });
  }

  /**
   * Crea un `SetupIntent` para capturar o actualizar la tarjeta in-app mediante Stripe Elements.
   */
  async createSetupIntent(
    userId: number,
    idempotencyKey?: string,
  ): Promise<SetupIntentResponseDto> {
    this.ensureStripeEnabled();
    const publishableKey = this.getPublishableKeyOrThrow();
    const scopedIdempotencyKey = this.buildScopedIdempotencyKey(
      userId,
      'setup_intent',
      idempotencyKey,
    );
    this.rateLimiter?.assertWithinLimit(userId, 'setup_intent');
    const { customerId } = await this.getOrCreateCustomerId(userId);

    const intent = await this.gateway.createSetupIntent({
      customerId,
      metadata: {
        userId: String(userId),
        env: this.config.billing.envTag,
      },
      ...(scopedIdempotencyKey ? { idempotencyKey: scopedIdempotencyKey } : {}),
    });

    if (!intent.clientSecret) {
      throw new AppHttpException(ErrorCode.BILLING_PROVIDER_ERROR, {
        operation: 'setupIntents.create',
      });
    }

    return {
      setupIntentId: intent.id,
      clientSecret: intent.clientSecret,
      publishableKey,
    };
  }

  /**
   * Fija un método de pago confirmado como predeterminado en el cliente y suscripción activa.
   */
  async setDefaultPaymentMethod(
    userId: number,
    dto: SetDefaultPaymentMethodDto,
  ): Promise<BillingPaymentMethodSummaryDto> {
    this.ensureStripeEnabled();
    this.rateLimiter?.assertWithinLimit(userId, 'mutation');

    return this.withUserLock(`pm:${userId}`, async () => {
      const { customerId } = await this.getOrCreateCustomerId(userId);

      const subRows = await this.db
        .select({
          id: billingSubscriptions.id,
          stripeSubscriptionId: billingSubscriptions.stripeSubscriptionId,
          status: billingSubscriptions.status,
        })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1);

      const activeSub =
        subRows[0] && isActiveSubscriptionStatus(subRows[0].status) ? subRows[0] : null;

      const summary = await this.gateway.attachAndSetDefaultPaymentMethod({
        customerId,
        paymentMethodId: dto.paymentMethodId.trim(),
        subscriptionId: activeSub?.stripeSubscriptionId ?? null,
      });

      if (subRows[0]) {
        await this.db
          .update(billingSubscriptions)
          .set({
            paymentMethodBrand: summary.brand,
            paymentMethodLast4: summary.last4,
            paymentMethodExpMonth: summary.expMonth,
            paymentMethodExpYear: summary.expYear,
            updatedAt: new Date(),
          })
          .where(eq(billingSubscriptions.id, subRows[0].id));
      }

      await this.auditLogs?.logEvent({
        module: 'billing',
        action: 'ACTION',
        event: 'billing.payment_method_updated',
        entityType: 'billing_subscriptions',
        entityId: activeSub?.id ?? userId,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Default payment method updated for user #${userId}`,
        metadata: { brand: summary.brand, last4: summary.last4 },
      });

      return {
        brand: summary.brand,
        last4: summary.last4,
        expMonth: summary.expMonth,
        expYear: summary.expYear,
      };
    });
  }

  /**
   * Lista el historial de facturas del usuario en Stripe (por defecto 24, máximo 100 por página).
   */
  async listInvoices(
    userId: number,
    query?: { limit?: number; startingAfter?: string },
  ): Promise<BillingInvoiceDto[]> {
    this.ensureStripeEnabled();
    this.rateLimiter?.assertWithinLimit(userId, 'invoices');
    const userRows = await this.db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    if (!user.stripeCustomerId) {
      return [];
    }

    const limit = Math.max(1, Math.min(MAX_INVOICES_LIMIT, query?.limit ?? DEFAULT_INVOICES_LIMIT));
    const trimmedAfter = query?.startingAfter?.trim();
    const startingAfter = trimmedAfter && trimmedAfter.length > 0 ? trimmedAfter : undefined;
    const invoices = await this.gateway.listInvoices({
      customerId: user.stripeCustomerId,
      limit,
      ...(startingAfter ? { startingAfter } : {}),
    });

    return invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaidCents: inv.amountPaidCents,
      amountDueCents: inv.amountDueCents,
      currency: inv.currency,
      createdAt: inv.createdAt,
      invoicePdfUrl: inv.invoicePdfUrl,
      hostedInvoiceUrl: inv.hostedInvoiceUrl,
    }));
  }

  /**
   * Genera una URL temporal del Customer Portal de Stripe como respaldo opcional.
   */
  async createPortalSession(userId: number): Promise<BillingPortalResponseDto> {
    this.ensureStripeEnabled();
    this.rateLimiter?.assertWithinLimit(userId, 'mutation');
    const { customerId } = await this.getOrCreateCustomerId(userId);
    const returnUrl = `${this.getFrontendBaseUrl()}/profile#subscription`;
    return this.gateway.createBillingPortalSession({ customerId, returnUrl });
  }

  /**
   * Valida, filtra por ambiente, deduplica y procesa webhooks entrantes de Stripe.
   */
  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<WebhookProcessedResponseDto> {
    this.ensureStripeEnabled();

    if (!signature || signature.trim().length === 0) {
      throw new AppHttpException(ErrorCode.BILLING_WEBHOOK_SIGNATURE_INVALID);
    }

    if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      throw new AppHttpException(ErrorCode.BILLING_CHECKOUT_INVALID, {
        reason: 'Missing raw request body for webhook signature verification',
      });
    }

    if (rawBody.length > MAX_WEBHOOK_PAYLOAD_BYTES) {
      throw new AppHttpException(ErrorCode.BILLING_CHECKOUT_INVALID, {
        reason: 'Webhook payload exceeds maximum allowed size',
        maxBytes: MAX_WEBHOOK_PAYLOAD_BYTES,
      });
    }

    const event = this.gateway.constructWebhookEvent(rawBody, signature);

    if (event.envTag && event.envTag !== this.config.billing.envTag) {
      return { received: true, ignored: true };
    }

    if (
      (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') &&
      !event.envTag &&
      event.invoice
    ) {
      const belongsHere = await this.findUserIdForInvoice(event.invoice);
      if (belongsHere === null) {
        return { received: true, ignored: true };
      }
    }

    const claimed = await this.claimWebhookEvent(event.id, event.type);
    if (!claimed) {
      return { received: true, ignored: true };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          if (event.checkoutSession) {
            await this.fulfillCheckoutSession(event.checkoutSession, undefined, false);
          }
          break;
        }
        case 'checkout.session.async_payment_succeeded': {
          // Pago asincrono (SPEI, OXXO, BOLETO): el cobro se confirma DESPUES
          // de 'checkout.session.completed'. Sin este caso el evento caia en
          // el 'default' y el credito (o la suscripcion) no se entregaba
          // nunca, aunque el usuario hubiera pagado.
          if (event.checkoutSession) {
            await this.fulfillCheckoutSession(event.checkoutSession, undefined, false);
          }
          break;
        }
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired': {
          // El pago fallo o el usuario abandono el checkout: la fila 'pending'
          // no debe quedarse colgada apareciendo como un pago fantasma.
          if (event.checkoutSession) {
            await this.markCheckoutSessionFailed(event.checkoutSession);
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          if (event.subscription) {
            await this.syncSubscriptionState(event.subscription);
          }
          break;
        }
        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed': {
          if (event.invoice) {
            await this.recordInvoiceEvent(
              event.invoice,
              event.type === 'invoice.payment_succeeded' ? 'paid' : 'failed',
            );
          }
          break;
        }
        case 'charge.refunded':
        case 'refund.created': {
          // Un reembolso tiene que revertir lo que concedio el cobro: si no,
          // el usuario se queda con el plan pagado (y en la tabla de pagos)
          // despues de que le devuelvan el dinero.
          if (event.refund) {
            await this.applyRefund(event.refund);
          }
          break;
        }
        default:
          break;
      }

      await this.db
        .update(billingWebhookEvents)
        .set({
          status: 'processed',
          errorMessage: null,
          processedAt: new Date(),
        })
        .where(eq(billingWebhookEvents.eventId, event.id));

      return { received: true, ignored: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.db
        .update(billingWebhookEvents)
        .set({
          status: 'failed',
          errorMessage: errorMessage.slice(0, 1000),
        })
        .where(eq(billingWebhookEvents.eventId, event.id));

      await this.errorLogs?.logError({
        severity: 'error',
        source: 'billing_provider',
        module: 'billing',
        errorCode: ErrorCode.INTERNAL_ERROR,
        httpStatus: 500,
        message: `Webhook '${event.type}' (${event.id}) failed: ${errorMessage}`,
        errorName: error instanceof Error ? error.name : typeof error,
        errorStack: error instanceof Error ? (error.stack ?? null) : null,
        details: { eventId: event.id, eventType: event.type },
      });

      throw error;
    }
  }

  /** Reclama un webhook nuevo o permite reintentar uno fallido o atascado, evitando dobles procesos. */
  private async claimWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
    const now = new Date();
    const inserted = await this.db
      .insert(billingWebhookEvents)
      .values({
        eventId,
        provider: 'stripe',
        eventType,
        status: 'processing',
        createdAt: now,
      })
      .onConflictDoNothing({ target: billingWebhookEvents.eventId })
      .returning({ eventId: billingWebhookEvents.eventId });

    if (inserted.length > 0) {
      return true;
    }

    const existingRows = await this.db
      .select({
        status: billingWebhookEvents.status,
        createdAt: billingWebhookEvents.createdAt,
      })
      .from(billingWebhookEvents)
      .where(eq(billingWebhookEvents.eventId, eventId))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return false;
    }

    // Un evento que quedo en 'failed' se reintenta: el handler devolvio 500
    // y Stripe vuelve a entregarlo.
    if (existing.status === 'failed') {
      const retried = await this.db
        .update(billingWebhookEvents)
        .set({ status: 'processing', errorMessage: null, createdAt: now })
        .where(
          and(eq(billingWebhookEvents.eventId, eventId), eq(billingWebhookEvents.status, 'failed')),
        )
        .returning({ eventId: billingWebhookEvents.eventId });

      return retried.length > 0;
    }

    // Un evento que quedo en 'processing' se considera atascado cuando el
    // proceso murio a mitad (OOM, kill, reinicio del contenedor) o el handler
    // se cuelgo: el INSERT se hizo pero el UPDATE final nunca llego. Sin
    // este reclamo, Stripe recibia un 200 y DEJABA de entregar el evento, y
    // la activacion de la suscripcion se perdia en silencio para siempre.
    if (existing.status === 'processing') {
      const claimedAt = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const age = Date.now() - claimedAt;
      if (!Number.isFinite(claimedAt) || age < STALE_WEBHOOK_PROCESSING_MS) {
        return false;
      }

      const reclaimed = await this.db
        .update(billingWebhookEvents)
        .set({ status: 'processing', errorMessage: null, createdAt: now })
        .where(
          and(
            eq(billingWebhookEvents.eventId, eventId),
            eq(billingWebhookEvents.status, 'processing'),
          ),
        )
        .returning({ eventId: billingWebhookEvents.eventId });

      if (reclaimed.length > 0) {
        this.logger.warn(
          `Webhook event ${eventId} was stuck in 'processing' for ${Math.round(age / 1000)}s and has been reclaimed`,
        );
      }
      return reclaimed.length > 0;
    }

    return false;
  }

  /** Aplica una sesión de checkout liquidada una sola vez y concede el producto correspondiente. */
  private async fulfillCheckoutSession(
    session: GatewayCheckoutSession,
    explicitUserId?: number,
    requireSettled = false,
  ): Promise<void> {
    const userId =
      explicitUserId ??
      parsePositiveInt(session.metadata['userId']) ??
      (await this.findUserIdByCustomerId(session.customerId));

    if (!userId) {
      this.logger.warn(`Checkout session ${session.id} could not be matched to a local user`);
      if (requireSettled) {
        throw new AppHttpException(ErrorCode.BILLING_CHECKOUT_INVALID, { sessionId: session.id });
      }
      return;
    }

    const isSettled =
      session.paymentStatus === 'paid' || session.paymentStatus === 'no_payment_required';

    if (!isSettled) {
      if (requireSettled) {
        throw new AppHttpException(ErrorCode.BILLING_PAYMENT_REQUIRED, {
          sessionId: session.id,
          paymentStatus: session.paymentStatus,
        });
      }
      return;
    }

    const kind =
      session.metadata['kind'] ??
      (session.mode === 'subscription' ? 'subscription' : 'language_unlock');

    if (kind === 'language_unlock') {
      const now = new Date();
      let granted = false;
      let nextCredits = 0;

      await this.db.transaction(async (tx) => {
        await tx
          .insert(billingPayments)
          .values({
            userId,
            provider: 'stripe',
            kind: 'language_unlock',
            tier: null,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.paymentIntentId,
            amountCents: session.amountTotal ?? 0,
            currency: session.currency ?? this.config.billing.currency,
            status: 'pending',
            metadata: session.metadata,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({ target: billingPayments.stripeCheckoutSessionId });

        const claimed = await tx
          .update(billingPayments)
          .set({
            status: 'paid',
            stripePaymentIntentId: session.paymentIntentId,
            amountCents: session.amountTotal ?? 0,
            currency: session.currency ?? this.config.billing.currency,
            fulfilledAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(billingPayments.stripeCheckoutSessionId, session.id),
              isNull(billingPayments.fulfilledAt),
            ),
          )
          .returning({ id: billingPayments.id });

        if (claimed.length > 0) {
          const result = await this.settings.grantLanguageChangeCredit(userId, tx);
          granted = true;
          nextCredits = result.nextCredits;
        }
      });

      if (granted) {
        await this.auditLogs?.logEvent({
          module: 'billing',
          action: 'ACTION',
          event: 'billing.language_unlock_fulfilled',
          entityType: 'billing_payments',
          entityId: session.id,
          actorUserId: userId,
          targetUserId: userId,
          summary: `Language unlock payment fulfilled for user #${userId} (credits=${nextCredits})`,
          metadata: { sessionId: session.id, nextCredits },
        });
      }
      return;
    }

    const tierHint = isPaidSubscriptionTier(session.metadata['tier'])
      ? session.metadata['tier']
      : undefined;

    if (session.subscriptionId) {
      const subId = session.subscriptionId;
      const subscription = await this.gateway.retrieveSubscription(subId);
      await this.syncSubscriptionState(subscription, userId, tierHint);
    }

    const now = new Date();
    await this.db
      .insert(billingPayments)
      .values({
        userId,
        provider: 'stripe',
        kind: 'subscription',
        tier: tierHint ?? null,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: session.paymentIntentId,
        amountCents: session.amountTotal ?? 0,
        currency: session.currency ?? this.config.billing.currency,
        status: 'paid',
        fulfilledAt: now,
        metadata: session.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: billingPayments.stripeCheckoutSessionId });
  }

  /** Sincroniza el estado local y el nivel efectivo desde la suscripción confirmada por Stripe. */
  private async syncSubscriptionState(
    subscription: GatewaySubscription,
    explicitUserId?: number,
    tierHint?: SubscriptionTier,
  ): Promise<void> {
    const userId =
      explicitUserId ??
      parsePositiveInt(subscription.metadata['userId']) ??
      (await this.findUserIdByCustomerOrSubscription(subscription.customerId, subscription.id));

    if (!userId) {
      this.logger.warn(
        `Stripe subscription ${subscription.id} could not be matched to a local user`,
      );
      return;
    }

    // Fallback FAIL-CERRADO: si el price no es ninguno de los configurados,
    // no se regala el plan pagado. Antes caia en 'dolly_plus' y cualquier
    // desajuste de configuracion concedia cuotas de pago sin cobrar.
    const resolvedTier: PaidSubscriptionTier | SubscriptionTier =
      resolveTierForPriceId(subscription.priceId, this.config) ??
      (isValidSubscriptionTier(subscription.metadata['tier'])
        ? subscription.metadata['tier']
        : null) ??
      tierHint ??
      'dolly';

    const pmSummary: GatewayPaymentMethodSummary | null =
      subscription.defaultPaymentMethod && typeof subscription.defaultPaymentMethod === 'object'
        ? subscription.defaultPaymentMethod
        : null;

    // Un plan pagado solo se concede si el pago esta CONFIRMADO.
    // 'incomplete' es lo que Stripe emite en cuanto arranca el cobro (3DS
    // abandonado, SPEI/OXXO sin confirmar, tarjeta rechazada): el dinero
    // todavia no esta. 'paused' es un cobro suspendido. Antes solo se
    // degradaban 'canceled', 'unpaid' e 'incomplete_expired', asi que una
    // suscripcion sin pagar concedia el plan pagado hasta que Stripe avisaba
    // (~23 h despues) y el usuario ya habia consumido las cuotas de pago.
    // 'past_due' NO se degrada: es dunning (se reintenta el cobro) y el
    // usuario mantiene lo que pago.
    const effectiveUserTier: SubscriptionTier = NON_ENTITLING_STRIPE_SUBSCRIPTION_STATUSES.includes(
      subscription.status as (typeof NON_ENTITLING_STRIPE_SUBSCRIPTION_STATUSES)[number],
    )
      ? 'dolly'
      : resolvedTier;

    const now = new Date();
    let previousUserTier: string | null = null;
    let ignoredStale = false;

    await this.db.transaction(async (tx) => {
      const userRows = await tx
        .select({
          subscriptionTier: users.subscriptionTier,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const userRow = userRows[0];
      if (!userRow) {
        ignoredStale = true;
        return;
      }
      previousUserTier = userRow.subscriptionTier;

      const currentSubRows = await tx
        .select({
          stripeSubscriptionId: billingSubscriptions.stripeSubscriptionId,
          status: billingSubscriptions.status,
        })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, userId))
        .limit(1);

      const currentSub = currentSubRows[0];
      if (
        currentSub &&
        currentSub.stripeSubscriptionId !== subscription.id &&
        isActiveSubscriptionStatus(currentSub.status) &&
        !isActiveSubscriptionStatus(subscription.status)
      ) {
        this.logger.warn(
          `Ignoring stale inactive subscription event '${subscription.id}' (${subscription.status}) while '${currentSub.stripeSubscriptionId}' (${currentSub.status}) is active for user #${userId}`,
        );
        ignoredStale = true;
        return;
      }

      await tx
        .insert(billingSubscriptions)
        .values({
          userId,
          provider: 'stripe',
          stripeCustomerId: subscription.customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.priceId,
          tier: resolvedTier,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          canceledAt: subscription.canceledAt,
          ...(pmSummary
            ? {
                paymentMethodBrand: pmSummary.brand,
                paymentMethodLast4: pmSummary.last4,
                paymentMethodExpMonth: pmSummary.expMonth,
                paymentMethodExpYear: pmSummary.expYear,
              }
            : {}),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: billingSubscriptions.userId,
          set: {
            stripeCustomerId: subscription.customerId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.priceId,
            tier: resolvedTier,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            canceledAt: subscription.canceledAt,
            ...(pmSummary
              ? {
                  paymentMethodBrand: pmSummary.brand,
                  paymentMethodLast4: pmSummary.last4,
                  paymentMethodExpMonth: pmSummary.expMonth,
                  paymentMethodExpYear: pmSummary.expYear,
                }
              : {}),
            updatedAt: now,
          },
        });

      await tx
        .update(users)
        .set({
          subscriptionTier: effectiveUserTier,
          ...(userRow.stripeCustomerId ? {} : { stripeCustomerId: subscription.customerId }),
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    });

    if (ignoredStale) {
      return;
    }

    await this.auditLogs?.logUpdate({
      module: 'billing',
      event:
        effectiveUserTier === 'dolly' && previousUserTier !== 'dolly'
          ? 'billing.subscription_downgraded_to_dolly'
          : 'billing.subscription_synced',
      entityType: 'billing_subscriptions',
      entityId: subscription.id,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Billing subscription synced for user #${userId}: status=${subscription.status}, tier=${effectiveUserTier}`,
      beforeState: { subscriptionTier: previousUserTier },
      afterState: {
        subscriptionTier: effectiveUserTier,
        stripeStatus: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      metadata: {
        stripeSubscriptionId: subscription.id,
        stripePriceId: subscription.priceId,
      },
    });
  }

  /** Registra el resultado de una factura y lo vincula con el usuario para historial y reembolsos. */
  private async recordInvoiceEvent(
    invoice: GatewayInvoice,
    outcome: 'paid' | 'failed',
  ): Promise<void> {
    const userId = await this.findUserIdForInvoice(invoice);
    if (!userId) {
      this.logger.warn(`Invoice ${invoice.id} could not be matched to a local user`);
      return;
    }

    const now = new Date();
    const amountCents = outcome === 'paid' ? invoice.amountPaidCents : invoice.amountDueCents;

    // El tipo de pago se deduce de la propia factura: una factura SIN
    // suscripcion es un pago de una sola vez (desbloqueo de idioma). Antes
    // todo se guardaba como 'subscription_invoice', asi que una compra de
    // idioma aparecia DOS veces en `recentPayments` (una por la sesion de
    // checkout y otra por la factura) con el importe duplicado.
    const kind = invoice.subscriptionId ? 'subscription_invoice' : 'language_unlock';

    await this.db.transaction(async (tx) => {
      // Si ya hay una fila para este PaymentIntent (la creo el checkout),
      // se actualiza esa en vez de insertar otra: un mismo cobro es una
      // sola fila.
      const existingByIntent = invoice.paymentIntentId
        ? await tx
            .select({ id: billingPayments.id })
            .from(billingPayments)
            .where(eq(billingPayments.stripePaymentIntentId, invoice.paymentIntentId))
            .limit(1)
        : [];

      if (existingByIntent[0]) {
        await tx
          .update(billingPayments)
          .set({
            amountCents,
            status: outcome,
            fulfilledAt: outcome === 'paid' ? now : null,
            updatedAt: now,
          })
          .where(eq(billingPayments.id, existingByIntent[0].id));
      } else {
        await tx
          .insert(billingPayments)
          .values({
            userId,
            provider: 'stripe',
            kind,
            tier: isValidSubscriptionTier(invoice.metadata['tier'])
              ? invoice.metadata['tier']
              : null,
            stripeInvoiceId: invoice.id,
            stripePaymentIntentId: invoice.paymentIntentId,
            amountCents,
            currency: invoice.currency,
            status: outcome,
            fulfilledAt: outcome === 'paid' ? now : null,
            metadata: invoice.metadata,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: billingPayments.stripeInvoiceId,
            set: {
              amountCents,
              status: outcome,
              fulfilledAt: outcome === 'paid' ? now : null,
              updatedAt: now,
            },
          });
      }

      if (outcome === 'failed' && invoice.subscriptionId) {
        await tx
          .update(billingSubscriptions)
          .set({ status: 'past_due', updatedAt: now })
          .where(eq(billingSubscriptions.stripeSubscriptionId, invoice.subscriptionId));
      }
    });
  }

  /**
   * Marca como fallido el pago de una sesion de checkout que no se llevo a
   * cabo (pago asincrono rechazado o checkout expirado).
   *
   * Sin esto, la fila `pending` se quedaba para siempre y aparecia en
   * `recentPayments` como un pago fantasma que el usuario nunca hizo.
   */
  private async markCheckoutSessionFailed(session: GatewayCheckoutSession): Promise<void> {
    const now = new Date();
    await this.db
      .update(billingPayments)
      .set({ status: 'failed', fulfilledAt: null, updatedAt: now })
      .where(
        and(
          eq(billingPayments.stripeCheckoutSessionId, session.id),
          eq(billingPayments.status, 'pending'),
        ),
      );
  }

  /**
   * Revierte los derechos de un reembolso.
   *
   * Un reembolso tiene que deshacer lo que concedio el cobro: si no, el
   * usuario se queda con el plan pagado y con el pago marcado como pagado
   * despues de que le devuelvan el dinero.
   */
  private async applyRefund(refund: GatewayRefund): Promise<void> {
    const conditions = [];
    if (refund.paymentIntentId) {
      conditions.push(eq(billingPayments.stripePaymentIntentId, refund.paymentIntentId));
    }
    if (refund.invoiceId) {
      conditions.push(eq(billingPayments.stripeInvoiceId, refund.invoiceId));
    }

    if (conditions.length === 0) {
      this.logger.warn(`Refund ${refund.id} has no payment intent nor invoice to match`);
      return;
    }

    const now = new Date();
    const rows = await this.db
      .select({
        id: billingPayments.id,
        userId: billingPayments.userId,
        kind: billingPayments.kind,
        status: billingPayments.status,
        tier: billingPayments.tier,
        amountCents: billingPayments.amountCents,
      })
      .from(billingPayments)
      .where(or(...conditions))
      .limit(1);

    const payment = rows[0];
    if (!payment) {
      this.logger.warn(`Refund ${refund.id} did not match any recorded payment`);
      return;
    }

    // `refund.created` trae solo el monto de ESE reembolso y el gateway lo marca como
    // total: se decide contra el monto cobrado que quedó registrado.
    const fullyRefunded =
      refund.fullyRefunded &&
      (payment.amountCents <= 0 || refund.amountRefundedCents >= payment.amountCents);

    let refundedKind: 'language_unlock' | 'subscription' | null = null;

    await this.db.transaction(async (tx) => {
      // Stripe manda `charge.refunded` y `refund.created` por el mismo reembolso: solo la
      // primera transición a 'refunded' revierte los derechos concedidos.
      const transitioned = await tx
        .update(billingPayments)
        .set({
          status: fullyRefunded ? 'refunded' : 'partially_refunded',
          updatedAt: now,
        })
        .where(and(eq(billingPayments.id, payment.id), ne(billingPayments.status, 'refunded')))
        .returning({ id: billingPayments.id });

      if (!fullyRefunded || transitioned.length === 0) {
        return;
      }

      if (payment.kind === 'language_unlock') {
        await tx
          .update(userSettings)
          .set({
            languageChangeCredits: sql`GREATEST(0, COALESCE(${userSettings.languageChangeCredits}, 0) - 1)`,
            updatedAt: now,
          })
          .where(eq(userSettings.userId, payment.userId));

        refundedKind = 'language_unlock';
        return;
      }

      // Si el reembolso es total y el pago era de una suscripcion, el plan
      // pagado se revoca: el dinero ya no esta.

      const isSubscriptionPayment =
        payment.kind === 'subscription' ||
        payment.kind === 'subscription_invoice' ||
        payment.kind === 'plan_change';

      if (isSubscriptionPayment) {
        await tx
          .update(users)
          .set({ subscriptionTier: 'dolly', updatedAt: now })
          .where(eq(users.id, payment.userId));

        await tx
          .update(billingSubscriptions)
          .set({ status: 'canceled', updatedAt: now })
          .where(eq(billingSubscriptions.userId, payment.userId));

        refundedKind = 'subscription';
      }
    });

    // B-6: emitimos auditoría solo después de confirmar la transacción para no dejar
    // eventos fantasma si PostgreSQL revierte el reembolso.
    if (refundedKind === 'language_unlock') {
      await this.auditLogs?.logEvent({
        module: 'billing',
        action: 'ACTION',
        event: 'billing.language_unlock_refunded',
        entityType: 'user_settings',
        entityId: payment.userId,
        actorUserId: payment.userId,
        targetUserId: payment.userId,
        summary: `Language unlock refunded for user #${payment.userId}; one change credit revoked`,
        metadata: { refundId: refund.id, paymentId: payment.id },
      });
    } else if (refundedKind === 'subscription') {
      await this.auditLogs?.logUpdate({
        module: 'billing',
        event: 'billing.subscription_refunded',
        entityType: 'user',
        entityId: payment.userId,
        actorUserId: payment.userId,
        targetUserId: payment.userId,
        summary: `Subscription refunded for user #${payment.userId}; plan downgraded to dolly`,
        beforeState: { subscriptionTier: payment.tier },
        afterState: { subscriptionTier: 'dolly' },
      });
    }
  }

  /** Busca al usuario local asociado a un identificador de cliente Stripe. */
  private async findUserIdByCustomerId(customerId: string | null): Promise<number | null> {
    if (!customerId) return null;
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** Resuelve al usuario primero por suscripción y luego por cliente Stripe como respaldo. */
  private async findUserIdByCustomerOrSubscription(
    customerId: string | null,
    subscriptionId: string | null,
  ): Promise<number | null> {
    if (subscriptionId) {
      const subRows = await this.db
        .select({ userId: billingSubscriptions.userId })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.stripeSubscriptionId, subscriptionId))
        .limit(1);
      if (subRows[0]?.userId) {
        return subRows[0].userId;
      }
    }
    return this.findUserIdByCustomerId(customerId);
  }

  /** Obtiene al usuario de la metadata de la factura o de sus relaciones de Stripe. */
  private async findUserIdForInvoice(invoice: GatewayInvoice): Promise<number | null> {
    const metaUserId = parsePositiveInt(invoice.metadata['userId']);
    if (metaUserId !== null) return metaUserId;
    return this.findUserIdByCustomerOrSubscription(invoice.customerId, invoice.subscriptionId);
  }

  /** Proyecta la fila local de suscripción a su resumen público sin incluir datos sensibles. */
  private toSubscriptionSummaryDto(row: BillingSubscription): BillingSubscriptionSummaryDto {
    const hasPm = Boolean(row.paymentMethodLast4 ?? row.paymentMethodBrand);
    const tier: SubscriptionTier = isValidSubscriptionTier(row.tier) ? row.tier : 'dolly';

    return {
      status: row.status,
      tier,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      canceledAt: row.canceledAt,
      paymentMethod: hasPm
        ? {
            brand: row.paymentMethodBrand,
            last4: row.paymentMethodLast4,
            expMonth: row.paymentMethodExpMonth,
            expYear: row.paymentMethodExpYear,
          }
        : null,
    };
  }

  /** Proyecta un pago persistido al formato del historial expuesto por la API. */
  private toRecentPaymentDto(row: BillingPayment): BillingRecentPaymentDto {
    return {
      id: row.id,
      kind: row.kind,
      tier: row.tier,
      amountCents: row.amountCents,
      currency: row.currency,
      status: row.status,
      fulfilledAt: row.fulfilledAt,
      createdAt: row.createdAt,
    };
  }
}
