// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import type { AppConfigService } from '../src/config/env.config';
import type { DrizzleDb } from '../src/database/database.module';
import { DRIZZLE } from '../src/database/database.tokens';
import { users } from '../src/database/drizzle/schema';
import { PAYMENT_GATEWAY } from '../src/modules/billing/billing.constants';
import type { BillingConfigResponseDto } from '../src/modules/billing/dto/billing-config-response.dto';
import type { BillingInvoiceDto } from '../src/modules/billing/dto/billing-invoice-response.dto';
import type { BillingPortalResponseDto } from '../src/modules/billing/dto/billing-portal-response.dto';
import type {
  BillingPaymentMethodSummaryDto,
  BillingStatusResponseDto,
} from '../src/modules/billing/dto/billing-status-response.dto';
import type { CheckoutSessionResponseDto } from '../src/modules/billing/dto/checkout-session-response.dto';
import type { SetupIntentResponseDto } from '../src/modules/billing/dto/setup-intent-response.dto';
import type { WebhookProcessedResponseDto } from '../src/modules/billing/dto/webhook-response.dto';
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
} from '../src/modules/billing/gateway/payment-gateway.interface';
import { StripeGateway } from '../src/modules/billing/gateway/stripe.gateway';
import { MailService } from '../src/modules/mail/mail.service';
import type { LanguagesSettingsDto } from '../src/modules/settings/dto/settings-catalog.dto';
import type { UserSubscriptionResponseDto } from '../src/modules/subscriptions/dto/user-subscription-response.dto';

interface Envelope<T> {
  message: string;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function asEnvelope<T>(body: unknown): Envelope<T> {
  return body as Envelope<T>;
}

const MOCK_SECRET_KEY = 'stripe-mock-secret';
const MOCK_PUBLISHABLE_KEY = 'stripe-mock-pk';
const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';
const PRICE_PLUS = 'price_mock_plus';
const PRICE_PRO = 'price_mock_pro';
const PRICE_UNLOCK = 'price_mock_unlock';

class InMemoryStripeGateway implements PaymentGateway {
  private customerCounter = 0;
  private sessionCounter = 0;
  private readonly sessions = new Map<string, GatewayCheckoutSession>();
  private readonly subscriptions = new Map<string, GatewaySubscription>();
  private readonly stripeWebhookVerifier: StripeGateway;

  constructor(private readonly envTag: string) {
    const configStub = {
      billing: {
        provider: 'stripe',
        envTag,
        currency: 'mxn',
        checkoutUiMode: 'custom',
        stripe: {
          secretKey: MOCK_SECRET_KEY,
          publishableKey: MOCK_PUBLISHABLE_KEY,
          webhookSecret: MOCK_WEBHOOK_SECRET,
          prices: {
            dolly: undefined,
            dollyPlus: PRICE_PLUS,
            dollyPro: PRICE_PRO,
            languageUnlock: PRICE_UNLOCK,
          },
        },
      },
    } as unknown as AppConfigService;
    this.stripeWebhookVerifier = new StripeGateway(configStub);
  }

  createCustomer(_input: CreateCustomerInput): Promise<{ id: string }> {
    this.customerCounter += 1;
    return Promise.resolve({ id: `cus_e2e_${this.customerCounter}` });
  }

  retrievePrice(priceId: string): Promise<GatewayPriceInfo> {
    if (priceId === PRICE_PLUS) {
      return Promise.resolve({
        id: priceId,
        unitAmount: 14900,
        currency: 'mxn',
        interval: 'month',
      });
    }
    if (priceId === PRICE_PRO) {
      return Promise.resolve({
        id: priceId,
        unitAmount: 24900,
        currency: 'mxn',
        interval: 'month',
      });
    }
    return Promise.resolve({
      id: priceId,
      unitAmount: 4900,
      currency: 'mxn',
      interval: null,
    });
  }

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<GatewayCheckoutSession> {
    this.sessionCounter += 1;
    const id = `cs_e2e_${this.sessionCounter}`;
    const isSub = input.mode === 'subscription';
    const session: GatewayCheckoutSession = {
      id,
      mode: input.mode,
      status: 'open',
      paymentStatus: 'unpaid',
      clientSecret: input.uiMode === 'custom' ? `cs_secret_${id}` : null,
      url: input.uiMode === 'hosted' ? `https://checkout.stripe.com/pay/${id}` : null,
      customerId: input.customerId,
      subscriptionId: isSub ? `sub_e2e_${this.sessionCounter}` : null,
      paymentIntentId: `pi_e2e_${this.sessionCounter}`,
      amountTotal: input.priceId === PRICE_UNLOCK ? 4900 : 14900,
      currency: 'mxn',
      metadata: { ...input.metadata },
    };
    this.sessions.set(id, session);

    if (isSub && session.subscriptionId) {
      this.subscriptions.set(session.subscriptionId, {
        id: session.subscriptionId,
        customerId: input.customerId,
        priceId: input.priceId,
        status: 'active',
        currentPeriodStart: new Date('2026-11-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        metadata: { ...(input.subscriptionMetadata ?? input.metadata), env: this.envTag },
        defaultPaymentMethod: {
          id: 'pm_initial',
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2030,
        },
      });
    }

    return Promise.resolve(session);
  }

  markSessionPaid(sessionId: string): GatewayCheckoutSession {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      throw new Error(`Unknown e2e checkout session ${sessionId}`);
    }
    const updated: GatewayCheckoutSession = {
      ...existing,
      status: 'complete',
      paymentStatus: 'paid',
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  retrieveCheckoutSession(sessionId: string): Promise<GatewayCheckoutSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error(`Checkout session ${sessionId} not found`));
    }
    return Promise.resolve(session);
  }

  retrieveSubscription(subscriptionId: string): Promise<GatewaySubscription> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return Promise.reject(new Error(`Subscription ${subscriptionId} not found`));
    }
    return Promise.resolve(sub);
  }

  updateSubscriptionPlan(input: UpdateSubscriptionPlanInput): Promise<GatewaySubscription> {
    const existing = this.subscriptions.get(input.subscriptionId);
    if (!existing) {
      return Promise.reject(new Error(`Subscription ${input.subscriptionId} not found`));
    }
    const updated: GatewaySubscription = {
      ...existing,
      priceId: input.newPriceId,
      metadata: { ...existing.metadata, ...(input.metadata ?? {}) },
    };
    this.subscriptions.set(input.subscriptionId, updated);
    return Promise.resolve(updated);
  }

  setSubscriptionCancelAtPeriodEnd(
    input: SetSubscriptionCancelInput,
  ): Promise<GatewaySubscription> {
    const existing = this.subscriptions.get(input.subscriptionId);
    if (!existing) {
      return Promise.reject(new Error(`Subscription ${input.subscriptionId} not found`));
    }
    const updated: GatewaySubscription = {
      ...existing,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    };
    this.subscriptions.set(input.subscriptionId, updated);
    return Promise.resolve(updated);
  }

  createSetupIntent(input: {
    customerId: string;
    metadata: Record<string, string>;
  }): Promise<GatewaySetupIntent> {
    return Promise.resolve({
      id: 'seti_e2e_1',
      clientSecret: 'seti_secret_e2e_1',
      customerId: input.customerId,
    });
  }

  attachAndSetDefaultPaymentMethod(
    input: AttachDefaultPaymentMethodInput,
  ): Promise<GatewayPaymentMethodSummary> {
    const summary: GatewayPaymentMethodSummary = {
      id: input.paymentMethodId,
      brand: 'mastercard',
      last4: '5555',
      expMonth: 10,
      expYear: 2029,
    };
    if (input.subscriptionId) {
      const sub = this.subscriptions.get(input.subscriptionId);
      if (sub) {
        this.subscriptions.set(input.subscriptionId, {
          ...sub,
          defaultPaymentMethod: summary,
        });
      }
    }
    return Promise.resolve(summary);
  }

  listInvoices(input: { customerId: string; limit?: number }): Promise<GatewayInvoice[]> {
    return Promise.resolve([
      {
        id: 'in_e2e_1',
        number: 'DOLY-2026-001',
        status: 'paid',
        amountPaidCents: 14900,
        amountDueCents: 14900,
        currency: 'mxn',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        invoicePdfUrl: 'https://pay.stripe.com/invoice/in_e2e_1/pdf',
        hostedInvoiceUrl: 'https://invoice.stripe.com/i/in_e2e_1',
        subscriptionId: 'sub_e2e_1',
        customerId: input.customerId,
        metadata: {},
      },
    ]);
  }

  createBillingPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    return Promise.resolve({
      url: `https://billing.stripe.com/p/session/e2e_${input.customerId}`,
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): GatewayWebhookEvent {
    return this.stripeWebhookVerifier.constructWebhookEvent(rawBody, signature);
  }
}

describe('Billing & Stripe flows (e2e)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envOverrides: Record<string, string> = {
    NODE_ENV: 'test',
    API_PREFIX: 'api/v1',
    JWT_ACCESS_TTL: '5m',
    JWT_REFRESH_TTL: '30d',
    LOG_LEVEL: 'silent',
    EMAIL_VERIFICATION_REQUIRED: 'false',
    BILLING_PROVIDER: 'stripe',
    BILLING_ENV_TAG: 'test-e2e',
    STRIPE_PUBLISHABLE_KEY: MOCK_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: MOCK_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: MOCK_WEBHOOK_SECRET,
    STRIPE_PRICE_DOLLY_PLUS: PRICE_PLUS,
    STRIPE_PRICE_DOLLY_PRO: PRICE_PRO,
    STRIPE_PRICE_LANGUAGE_UNLOCK: PRICE_UNLOCK,
    STRIPE_CHECKOUT_UI_MODE: 'custom',
    STRIPE_CURRENCY: 'mxn',
  };

  let app: INestApplication;
  let db: DrizzleDb;
  let gateway: InMemoryStripeGateway;
  let createdUserId: number | null = null;
  let eventSeq = 0;

  const uniqueEmail = (): string =>
    `billing-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  const signStripeEvent = (
    eventPayload: Record<string, unknown>,
  ): { body: string; sig: string } => {
    const body = JSON.stringify(eventPayload);
    const stripe = new Stripe(MOCK_SECRET_KEY);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: MOCK_WEBHOOK_SECRET,
    });
    return { body, sig };
  };

  const makeStripeEventId = (): string => {
    eventSeq += 1;
    return `evt_e2e_${Date.now()}_${eventSeq}`;
  };

  beforeAll(async () => {
    for (const [key, value] of Object.entries(envOverrides)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }

    const { AppModule } = await import('../src/app.module');
    gateway = new InMemoryStripeGateway('test-e2e');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendAccountConfirmation: jest.fn().mockResolvedValue(undefined),
        sendPasswordReset: jest.fn().mockResolvedValue(undefined),
        sendAccessRequestNotification: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .compile();

    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    db = moduleRef.get(DRIZZLE);
  });

  afterAll(async () => {
    if (createdUserId !== null) {
      await db.delete(users).where(eq(users.id, createdUserId));
    }
    await app.close();

    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('completes custom checkout, webhooks with idempotency, language unlock, in-app management, and downgrade to dolly', async () => {
    const server = app.getHttpServer();

    // 1. Public billing config reflects custom Elements mode and pricing
    const configRes = await supertest(server).get('/api/v1/billing/config').expect(200);
    const configEnv = asEnvelope<BillingConfigResponseDto>(configRes.body);
    expect(configEnv.data.provider).toBe('stripe');
    expect(configEnv.data.uiMode).toBe('custom');
    expect(configEnv.data.publishableKey).toBe(MOCK_PUBLISHABLE_KEY);
    expect(configEnv.data.plans.find((p) => p.tier === 'dolly')?.isFree).toBe(true);
    expect(configEnv.data.plans.find((p) => p.tier === 'dolly_plus')?.amountCents).toBe(14900);
    expect(configEnv.data.languageUnlock.amountCents).toBe(4900);

    // 2. Register user, verify paid direct selection returns 402, free dolly works
    const regRes = await supertest(server)
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail(),
        password: 'secure-pass-123',
        fullName: 'Billing E2E User',
        locale: 'es',
      })
      .expect(201);
    const regBody = asEnvelope<{
      user: { id: number };
      tokens: { accessToken: string };
    }>(regRes.body);
    createdUserId = regBody.data.user.id;
    const authHeader = `Bearer ${regBody.data.tokens.accessToken}`;

    const paidDirectRes = await supertest(server)
      .post('/api/v1/user/subscription')
      .set('Authorization', authHeader)
      .send({ tier: 'dolly_plus' })
      .expect(402);
    expect(asEnvelope<null>(paidDirectRes.body).error?.code).toBe('BILLING_PAYMENT_REQUIRED');

    const freeDollyRes = await supertest(server)
      .post('/api/v1/user/subscription')
      .set('Authorization', authHeader)
      .send({ tier: 'dolly' })
      .expect(201);
    expect(asEnvelope<UserSubscriptionResponseDto>(freeDollyRes.body).data.tier).toBe('dolly');

    // 3. Set initial language ['en'] and verify direct manual unlock returns 402
    await supertest(server)
      .put('/api/v1/settings/languages')
      .set('Authorization', authHeader)
      .send({ languages: ['en'] })
      .expect(200);

    const directUnlockRes = await supertest(server)
      .post('/api/v1/settings/languages/unlock-change')
      .set('Authorization', authHeader)
      .expect(402);
    expect(asEnvelope<null>(directUnlockRes.body).error?.code).toBe('BILLING_PAYMENT_REQUIRED');

    // 4. Reject invalid Stripe webhook signature
    const badSigRes = await supertest(server)
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', 't=123,v1=invalid')
      .send(JSON.stringify({ id: 'evt_bad', type: 'checkout.session.completed' }))
      .expect(400);
    expect(asEnvelope<null>(badSigRes.body).error?.code).toBe('BILLING_WEBHOOK_SIGNATURE_INVALID');

    // 5. Create custom checkout for dolly_plus
    const subCheckoutRes = await supertest(server)
      .post('/api/v1/billing/checkout/subscription')
      .set('Authorization', authHeader)
      .send({ tier: 'dolly_plus' })
      .expect(201);
    const subCheckout = asEnvelope<CheckoutSessionResponseDto>(subCheckoutRes.body).data;
    expect(subCheckout.uiMode).toBe('custom');
    expect(subCheckout.clientSecret).toBeTruthy();

    // Mark session paid in mock gateway and send signed checkout.session.completed webhook
    const paidSubSession = gateway.markSessionPaid(subCheckout.sessionId);
    const subEventId = makeStripeEventId();
    const signedSubCompleted = signStripeEvent({
      id: subEventId,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: paidSubSession.id,
          object: 'checkout.session',
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          client_secret: paidSubSession.clientSecret,
          url: null,
          customer: paidSubSession.customerId,
          subscription: paidSubSession.subscriptionId,
          payment_intent: paidSubSession.paymentIntentId,
          amount_total: 14900,
          currency: 'mxn',
          metadata: paidSubSession.metadata,
        },
      },
    });

    const whFirst = await supertest(server)
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', signedSubCompleted.sig)
      .send(signedSubCompleted.body)
      .expect(200);
    expect(asEnvelope<WebhookProcessedResponseDto>(whFirst.body).data).toEqual({
      received: true,
      ignored: false,
    });

    // Replay exact same webhook event -> deduplicated
    const whReplay = await supertest(server)
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', signedSubCompleted.sig)
      .send(signedSubCompleted.body)
      .expect(200);
    expect(asEnvelope<WebhookProcessedResponseDto>(whReplay.body).data).toEqual({
      received: true,
      ignored: true,
    });

    // Synchronous /sync endpoint is idempotent and returns active dolly_plus state
    const syncSubRes = await supertest(server)
      .post(`/api/v1/billing/checkout/${subCheckout.sessionId}/sync`)
      .set('Authorization', authHeader)
      .expect(200);
    const statusAfterSub = asEnvelope<BillingStatusResponseDto>(syncSubRes.body).data;
    expect(statusAfterSub.tier).toBe('dolly_plus');
    expect(statusAfterSub.subscription?.status).toBe('active');

    // 6. Add second language ['en', 'fr'] on dolly_plus
    const langsPlusRes = await supertest(server)
      .put('/api/v1/settings/languages')
      .set('Authorization', authHeader)
      .send({ languages: ['en', 'fr'] })
      .expect(200);
    expect(asEnvelope<LanguagesSettingsDto>(langsPlusRes.body).data.active).toEqual(['en', 'fr']);

    // 7. Language unlock one-time checkout -> webhook + /sync credits strictly +1
    const unlockCheckoutRes = await supertest(server)
      .post('/api/v1/billing/checkout/language-unlock')
      .set('Authorization', authHeader)
      .send({})
      .expect(201);
    const unlockCheckout = asEnvelope<CheckoutSessionResponseDto>(unlockCheckoutRes.body).data;

    const paidUnlockSession = gateway.markSessionPaid(unlockCheckout.sessionId);
    const unlockSigned = signStripeEvent({
      id: makeStripeEventId(),
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: paidUnlockSession.id,
          object: 'checkout.session',
          mode: 'payment',
          status: 'complete',
          payment_status: 'paid',
          client_secret: paidUnlockSession.clientSecret,
          url: null,
          customer: paidUnlockSession.customerId,
          subscription: null,
          payment_intent: paidUnlockSession.paymentIntentId,
          amount_total: 4900,
          currency: 'mxn',
          metadata: paidUnlockSession.metadata,
        },
      },
    });

    await supertest(server)
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', unlockSigned.sig)
      .send(unlockSigned.body)
      .expect(200);

    await supertest(server)
      .post(`/api/v1/billing/checkout/${unlockCheckout.sessionId}/sync`)
      .set('Authorization', authHeader)
      .expect(200);

    const langsAfterUnlockRes = await supertest(server)
      .get('/api/v1/settings/languages')
      .set('Authorization', authHeader)
      .expect(200);
    expect(
      asEnvelope<LanguagesSettingsDto>(langsAfterUnlockRes.body).data.languageChangeCredits,
    ).toBe(1);

    // 8. In-app lifecycle management (change-plan, cancel, resume, setup-intent, default PM, invoices, portal)
    const upgradedRes = await supertest(server)
      .post('/api/v1/billing/subscription/change-plan')
      .set('Authorization', authHeader)
      .set('Idempotency-Key', 'e2e-upgrade-pro-1')
      .send({ tier: 'dolly_pro' })
      .expect(200);
    expect(asEnvelope<BillingStatusResponseDto>(upgradedRes.body).data.tier).toBe('dolly_pro');

    // Out-of-order stale canceled webhook for an old subscription does not downgrade active sub
    const staleOldDeletedSigned = signStripeEvent({
      id: makeStripeEventId(),
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_old_stale',
          object: 'subscription',
          customer: paidSubSession.customerId,
          status: 'canceled',
          cancel_at_period_end: false,
          canceled_at: Math.floor(Date.now() / 1000),
          metadata: { userId: String(createdUserId), env: 'test-e2e' },
          items: {
            object: 'list',
            data: [
              {
                id: 'si_old',
                price: { id: PRICE_PLUS },
                current_period_start: 1,
                current_period_end: 2,
              },
            ],
          },
        },
      },
    });
    await supertest(server)
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', staleOldDeletedSigned.sig)
      .send(staleOldDeletedSigned.body)
      .expect(200);

    const statusStillProRes = await supertest(server)
      .get('/api/v1/billing/status')
      .set('Authorization', authHeader)
      .expect(200);
    expect(asEnvelope<BillingStatusResponseDto>(statusStillProRes.body).data.tier).toBe(
      'dolly_pro',
    );

    const canceledRes = await supertest(server)
      .post('/api/v1/billing/subscription/cancel')
      .set('Authorization', authHeader)
      .expect(200);
    expect(
      asEnvelope<BillingStatusResponseDto>(canceledRes.body).data.subscription?.cancelAtPeriodEnd,
    ).toBe(true);

    const resumedRes = await supertest(server)
      .post('/api/v1/billing/subscription/resume')
      .set('Authorization', authHeader)
      .expect(200);
    expect(
      asEnvelope<BillingStatusResponseDto>(resumedRes.body).data.subscription?.cancelAtPeriodEnd,
    ).toBe(false);

    const setupIntentRes = await supertest(server)
      .post('/api/v1/billing/payment-method/setup-intent')
      .set('Authorization', authHeader)
      .expect(201);
    expect(asEnvelope<SetupIntentResponseDto>(setupIntentRes.body).data.clientSecret).toBe(
      'seti_secret_e2e_1',
    );

    const defaultPmRes = await supertest(server)
      .post('/api/v1/billing/payment-method/default')
      .set('Authorization', authHeader)
      .send({ paymentMethodId: 'pm_e2e_new' })
      .expect(200);
    expect(asEnvelope<BillingPaymentMethodSummaryDto>(defaultPmRes.body).data).toEqual({
      brand: 'mastercard',
      last4: '5555',
      expMonth: 10,
      expYear: 2029,
    });

    const invoicesRes = await supertest(server)
      .get('/api/v1/billing/invoices')
      .set('Authorization', authHeader)
      .expect(200);
    expect(asEnvelope<BillingInvoiceDto[]>(invoicesRes.body).data).toHaveLength(1);

    const portalRes = await supertest(server)
      .post('/api/v1/billing/portal')
      .set('Authorization', authHeader)
      .expect(200);
    expect(asEnvelope<BillingPortalResponseDto>(portalRes.body).data.url).toContain(
      'billing.stripe.com',
    );

    // 9. Wrong-environment webhook (staging) is ignored without affecting user state
    const wrongEnvSigned = signStripeEvent({
      id: makeStripeEventId(),
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: paidSubSession.subscriptionId,
          object: 'subscription',
          customer: paidSubSession.customerId,
          status: 'canceled',
          cancel_at_period_end: false,
          canceled_at: Math.floor(Date.now() / 1000),
          metadata: { userId: String(createdUserId), env: 'staging' },
          items: {
            object: 'list',
            data: [
              {
                id: 'si_other',
                price: { id: PRICE_PRO },
                current_period_start: 1,
                current_period_end: 2,
              },
            ],
          },
        },
      },
    });
    const wrongEnvRes = await supertest(server)
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', wrongEnvSigned.sig)
      .send(wrongEnvSigned.body)
      .expect(200);
    expect(asEnvelope<WebhookProcessedResponseDto>(wrongEnvRes.body).data).toEqual({
      received: true,
      ignored: true,
    });

    // 10. Subscription deleted webhook in matching env downgrades to dolly while preserving language priority
    const subDeletedSigned = signStripeEvent({
      id: makeStripeEventId(),
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: paidSubSession.subscriptionId,
          object: 'subscription',
          customer: paidSubSession.customerId,
          status: 'canceled',
          cancel_at_period_end: false,
          canceled_at: Math.floor(Date.now() / 1000),
          metadata: { userId: String(createdUserId), env: 'test-e2e' },
          items: {
            object: 'list',
            data: [
              {
                id: 'si_e2e_1',
                price: { id: PRICE_PRO },
                current_period_start: 1,
                current_period_end: 2,
              },
            ],
          },
        },
      },
    });
    await supertest(server)
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', subDeletedSigned.sig)
      .send(subDeletedSigned.body)
      .expect(200);

    const statusFinalRes = await supertest(server)
      .get('/api/v1/billing/status')
      .set('Authorization', authHeader)
      .expect(200);
    expect(asEnvelope<BillingStatusResponseDto>(statusFinalRes.body).data.tier).toBe('dolly');

    const langsFinalRes = await supertest(server)
      .get('/api/v1/settings/languages')
      .set('Authorization', authHeader)
      .expect(200);
    const finalLangs = asEnvelope<LanguagesSettingsDto>(langsFinalRes.body).data;
    expect(finalLangs.selected).toEqual(['en', 'fr']);
    expect(finalLangs.active).toEqual(['en']);
    expect(finalLangs.maxLanguages).toBe(1);

    // 11. Hardening checks: input validation, Idempotency-Key validation, stale subscription webhook ignored, and rate limit 429
    const badSyncRes = await supertest(server)
      .post('/api/v1/billing/checkout/invalid_session/sync')
      .set('Authorization', authHeader)
      .expect(400);
    expect(asEnvelope<null>(badSyncRes.body).error?.code).toBe('BILLING_CHECKOUT_INVALID');

    const badPmRes = await supertest(server)
      .post('/api/v1/billing/payment-method/default')
      .set('Authorization', authHeader)
      .send({ paymentMethodId: 'invalid_pm' })
      .expect(400);
    expect(asEnvelope<null>(badPmRes.body).error?.code).toBe('VALIDATION_ERROR');

    const badIdemRes = await supertest(server)
      .post('/api/v1/billing/payment-method/setup-intent')
      .set('Authorization', authHeader)
      .set('Idempotency-Key', 'invalid key!!')
      .expect(400);
    expect(asEnvelope<null>(badIdemRes.body).error?.code).toBe('VALIDATION_ERROR');

    // Step 8 used 1 of 5 setup-intent slots in the 60s window; 4 more succeed, 5th hits 429
    for (let i = 0; i < 4; i++) {
      await supertest(server)
        .post('/api/v1/billing/payment-method/setup-intent')
        .set('Authorization', authHeader)
        .set('Idempotency-Key', `e2e-setup-${i}`)
        .expect(201);
    }
    const rateLimitedRes = await supertest(server)
      .post('/api/v1/billing/payment-method/setup-intent')
      .set('Authorization', authHeader)
      .expect(429);
    const rateBody = asEnvelope<null>(rateLimitedRes.body);
    expect(rateBody.error?.code).toBe('BILLING_RATE_LIMITED');
    expect(typeof rateBody.error?.details?.['retryAfterSeconds']).toBe('number');
  });
});
