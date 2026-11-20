import { Injectable, Logger, Optional } from '@nestjs/common';
import Stripe from 'stripe';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AppConfigService } from '../../../config/env.config';
import { ErrorLogService } from '../../logs';
import type {
  AttachDefaultPaymentMethodInput,
  CreateCheckoutSessionInput,
  CreateCustomerInput,
  GatewayCheckoutSession,
  GatewayInvoice,
  GatewayPaymentMethodSummary,
  GatewayPriceInfo,
  GatewaySetupIntent,
  GatewaySubscription,
  GatewayWebhookEvent,
  PaymentGateway,
  SetSubscriptionCancelInput,
  UpdateSubscriptionPlanInput,
} from './payment-gateway.interface';

function toDateFromUnix(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}

function extractId(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

function toStringMetadata(meta: Stripe.Metadata | null | undefined): Record<string, string> {
  if (!meta) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function mapCheckoutLocale(
  locale: string | null | undefined,
): Stripe.Checkout.SessionCreateParams.Locale {
  switch (locale) {
    case 'es':
    case 'en':
    case 'fr':
    case 'it':
      return locale;
    default:
      return 'auto';
  }
}

function mapPaymentMethodSummary(pm: Stripe.PaymentMethod): GatewayPaymentMethodSummary {
  return {
    id: pm.id,
    brand: pm.card?.brand ?? pm.type ?? null,
    last4: pm.card?.last4 ?? null,
    expMonth: pm.card?.exp_month ?? null,
    expYear: pm.card?.exp_year ?? null,
  };
}

/**
 * Adaptador oficial hacia Stripe usando el SDK `stripe`.
 */
@Injectable()
export class StripeGateway implements PaymentGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private client: Stripe | null = null;
  private clientSecretKey: string | undefined;

  constructor(
    private readonly config: AppConfigService,
    @Optional() private readonly errorLogs?: ErrorLogService,
  ) {}

  private getClient(): Stripe {
    const secretKey = this.config.billing.stripe.secretKey;
    if (!secretKey) {
      throw new AppHttpException(ErrorCode.BILLING_NOT_CONFIGURED);
    }

    if (!this.client || this.clientSecretKey !== secretKey) {
      this.client = new Stripe(secretKey, {
        timeout: 15_000,
        maxNetworkRetries: 2,
      });
      this.clientSecretKey = secretKey;
    }

    return this.client;
  }

  private async runStripe<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AppHttpException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Stripe operation '${operation}' failed: ${message}`);
      await this.errorLogs?.logError({
        severity: 'error',
        source: 'billing_provider',
        module: 'billing',
        errorCode: ErrorCode.BILLING_PROVIDER_ERROR,
        httpStatus: 502,
        message: `Stripe operation '${operation}' failed: ${message}`,
        errorName: error instanceof Error ? error.name : typeof error,
        errorStack: error instanceof Error ? (error.stack ?? null) : null,
        details: { operation },
      });

      if (error instanceof Stripe.errors.StripeCardError) {
        throw new AppHttpException(ErrorCode.BILLING_PAYMENT_REQUIRED, {
          operation,
          declineCode: error.decline_code ?? null,
        });
      }
      if (error instanceof Stripe.errors.StripeRateLimitError) {
        throw new AppHttpException(ErrorCode.BILLING_RATE_LIMITED, { operation });
      }
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 404) {
        throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'StripeResource' });
      }
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 400) {
        throw new AppHttpException(ErrorCode.BILLING_CHECKOUT_INVALID, { operation });
      }

      throw new AppHttpException(ErrorCode.BILLING_PROVIDER_ERROR, { operation });
    }
  }

  async createCustomer(input: CreateCustomerInput): Promise<{ id: string }> {
    const stripe = this.getClient();
    const customer = await this.runStripe('customers.create', () =>
      stripe.customers.create(
        {
          email: input.email,
          ...(input.name ? { name: input.name } : {}),
          metadata: input.metadata,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      ),
    );
    return { id: customer.id };
  }

  async retrievePrice(priceId: string): Promise<GatewayPriceInfo> {
    const stripe = this.getClient();
    const price = await this.runStripe('prices.retrieve', () => stripe.prices.retrieve(priceId));
    return {
      id: price.id,
      unitAmount: price.unit_amount ?? null,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    };
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<GatewayCheckoutSession> {
    const stripe = this.getClient();
    const baseParams: Stripe.Checkout.SessionCreateParams = {
      customer: input.customerId,
      mode: input.mode,
      line_items: [{ price: input.priceId, quantity: 1 }],
      locale: mapCheckoutLocale(input.locale),
      metadata: input.metadata,
      ...(input.mode === 'subscription' && input.subscriptionMetadata
        ? { subscription_data: { metadata: input.subscriptionMetadata } }
        : {}),
      ...(input.uiMode === 'custom'
        ? {
            ui_mode: 'elements',
            return_url: input.returnUrl,
          }
        : {
            ui_mode: 'hosted_page',
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
          }),
    };

    const session = await this.runStripe('checkout.sessions.create', () =>
      stripe.checkout.sessions.create(
        baseParams,
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      ),
    );
    return this.mapCheckoutSession(session);
  }

  async retrieveCheckoutSession(sessionId: string): Promise<GatewayCheckoutSession> {
    const stripe = this.getClient();
    const session = await this.runStripe('checkout.sessions.retrieve', () =>
      stripe.checkout.sessions.retrieve(sessionId),
    );
    return this.mapCheckoutSession(session);
  }

  async retrieveSubscription(subscriptionId: string): Promise<GatewaySubscription> {
    const stripe = this.getClient();
    const sub = await this.runStripe('subscriptions.retrieve', () =>
      stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method'],
      }),
    );
    return this.mapSubscription(sub);
  }

  async updateSubscriptionPlan(input: UpdateSubscriptionPlanInput): Promise<GatewaySubscription> {
    const stripe = this.getClient();
    const current = await this.runStripe('subscriptions.retrieveForPlanChange', () =>
      stripe.subscriptions.retrieve(input.subscriptionId),
    );
    const primaryItemId = current.items.data[0]?.id;
    if (!primaryItemId) {
      throw new AppHttpException(ErrorCode.BILLING_PROVIDER_ERROR, {
        operation: 'subscriptions.updatePlan',
      });
    }

    const updated = await this.runStripe('subscriptions.update', () =>
      stripe.subscriptions.update(
        input.subscriptionId,
        {
          items: [{ id: primaryItemId, price: input.newPriceId }],
          proration_behavior: 'create_prorations',
          payment_behavior: 'pending_if_incomplete',
          cancel_at_period_end: false,
          ...(input.metadata ? { metadata: input.metadata } : {}),
          expand: ['default_payment_method'],
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      ),
    );
    return this.mapSubscription(updated);
  }

  async setSubscriptionCancelAtPeriodEnd(
    input: SetSubscriptionCancelInput,
  ): Promise<GatewaySubscription> {
    const stripe = this.getClient();
    const updated = await this.runStripe('subscriptions.setCancelAtPeriodEnd', () =>
      stripe.subscriptions.update(input.subscriptionId, {
        cancel_at_period_end: input.cancelAtPeriodEnd,
        expand: ['default_payment_method'],
      }),
    );
    return this.mapSubscription(updated);
  }

  async createSetupIntent(input: {
    customerId: string;
    metadata: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<GatewaySetupIntent> {
    const stripe = this.getClient();
    const intent = await this.runStripe('setupIntents.create', () =>
      stripe.setupIntents.create(
        {
          customer: input.customerId,
          usage: 'off_session',
          automatic_payment_methods: { enabled: true },
          metadata: input.metadata,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      ),
    );
    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? null,
      customerId: extractId(intent.customer),
    };
  }

  async attachAndSetDefaultPaymentMethod(
    input: AttachDefaultPaymentMethodInput,
  ): Promise<GatewayPaymentMethodSummary> {
    const stripe = this.getClient();
    const pm = await this.runStripe('paymentMethods.retrieve', () =>
      stripe.paymentMethods.retrieve(input.paymentMethodId),
    );
    const ownerCustomerId = extractId(pm.customer);

    if (ownerCustomerId && ownerCustomerId !== input.customerId) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
        resource: 'PaymentMethod',
      });
    }

    let attached = pm;
    if (!ownerCustomerId) {
      attached = await this.runStripe('paymentMethods.attach', () =>
        stripe.paymentMethods.attach(input.paymentMethodId, {
          customer: input.customerId,
        }),
      );
    }

    await this.runStripe('customers.updateDefaultPaymentMethod', () =>
      stripe.customers.update(input.customerId, {
        invoice_settings: { default_payment_method: attached.id },
      }),
    );

    if (input.subscriptionId) {
      const subId = input.subscriptionId;
      await this.runStripe('subscriptions.updateDefaultPaymentMethod', () =>
        stripe.subscriptions.update(subId, {
          default_payment_method: attached.id,
        }),
      );
    }

    return mapPaymentMethodSummary(attached);
  }

  async listInvoices(input: { customerId: string; limit?: number }): Promise<GatewayInvoice[]> {
    const stripe = this.getClient();
    const list = await this.runStripe('invoices.list', () =>
      stripe.invoices.list({
        customer: input.customerId,
        limit: input.limit ?? 24,
      }),
    );
    return list.data.map((inv) => this.mapInvoice(inv));
  }

  async createBillingPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const stripe = this.getClient();
    const session = await this.runStripe('billingPortal.sessions.create', () =>
      stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      }),
    );
    return { url: session.url };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): GatewayWebhookEvent {
    const webhookSecret = this.config.billing.stripe.webhookSecret;
    if (!webhookSecret) {
      throw new AppHttpException(ErrorCode.BILLING_NOT_CONFIGURED);
    }

    const stripe = this.getClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Invalid Stripe webhook signature: ${message}`);
      throw new AppHttpException(ErrorCode.BILLING_WEBHOOK_SIGNATURE_INVALID);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const mapped = this.mapCheckoutSession(session);
        return {
          id: event.id,
          type: event.type,
          envTag: mapped.metadata['env'] ?? null,
          checkoutSession: mapped,
        };
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const mapped = this.mapSubscription(sub);
        return {
          id: event.id,
          type: event.type,
          envTag: mapped.metadata['env'] ?? null,
          subscription: mapped,
        };
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const mapped = this.mapInvoice(invoice);
        return {
          id: event.id,
          type: event.type,
          envTag: mapped.metadata['env'] ?? null,
          invoice: mapped,
        };
      }
      default:
        return {
          id: event.id,
          type: event.type,
          envTag: null,
        };
    }
  }

  private mapCheckoutSession(session: Stripe.Checkout.Session): GatewayCheckoutSession {
    return {
      id: session.id,
      mode: session.mode,
      status: session.status ?? null,
      paymentStatus: session.payment_status,
      clientSecret: session.client_secret ?? null,
      url: session.url ?? null,
      customerId: extractId(session.customer),
      subscriptionId: extractId(session.subscription),
      paymentIntentId: extractId(session.payment_intent),
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      metadata: toStringMetadata(session.metadata),
    };
  }

  private mapSubscription(sub: Stripe.Subscription): GatewaySubscription {
    const primaryItem = sub.items.data[0];
    const priceId = primaryItem?.price.id ?? '';
    const defaultPm =
      sub.default_payment_method && typeof sub.default_payment_method === 'object'
        ? mapPaymentMethodSummary(sub.default_payment_method)
        : (sub.default_payment_method ?? null);

    return {
      id: sub.id,
      customerId: extractId(sub.customer) ?? '',
      priceId,
      status: sub.status,
      currentPeriodStart: toDateFromUnix(primaryItem?.current_period_start),
      currentPeriodEnd: toDateFromUnix(primaryItem?.current_period_end),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: toDateFromUnix(sub.canceled_at),
      metadata: toStringMetadata(sub.metadata),
      defaultPaymentMethod: defaultPm,
    };
  }

  private mapInvoice(invoice: Stripe.Invoice): GatewayInvoice {
    const subscriptionDetails = invoice.parent?.subscription_details;
    const subscriptionId = subscriptionDetails ? extractId(subscriptionDetails.subscription) : null;
    const invoiceMeta = toStringMetadata(invoice.metadata);
    const subMeta = toStringMetadata(subscriptionDetails?.metadata);

    return {
      id: invoice.id,
      number: invoice.number ?? null,
      status: invoice.status ?? null,
      amountPaidCents: invoice.amount_paid,
      amountDueCents: invoice.amount_due,
      currency: invoice.currency,
      createdAt: new Date(invoice.created * 1000),
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      subscriptionId,
      customerId: extractId(invoice.customer),
      metadata: { ...subMeta, ...invoiceMeta },
    };
  }
}
