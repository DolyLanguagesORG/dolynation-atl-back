import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AppConfigService } from '../../config/env.config';
import type { DrizzleDb } from '../../database/database.module';
import type { AuditLogService, ErrorLogService } from '../logs';
import type { SettingsService } from '../settings/settings.service';
import { SUBSCRIPTION_PLANS } from '../subscriptions/subscriptions.constants';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { BILLING_RATE_LIMITS, BillingRateLimitService } from './billing-rate-limit.service';
import { BillingService } from './billing.service';
import type {
  GatewayCheckoutSession,
  GatewayInvoice,
  GatewaySubscription,
  GatewayWebhookEvent,
  PaymentGateway,
} from './gateway/payment-gateway.interface';

describe('BillingService', () => {
  let billingProvider: 'manual' | 'stripe';
  let dbMock: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };
  let gateway: { [K in keyof PaymentGateway]: jest.Mock };
  let settings: { grantLanguageChangeCredit: jest.Mock };
  let subscriptions: { assertSubscriptionActive: jest.Mock };
  let auditLogs: { logEvent: jest.Mock; logUpdate: jest.Mock };
  let errorLogs: { logError: jest.Mock };
  let rateLimiter: BillingRateLimitService;
  let configMock: AppConfigService;
  let service: BillingService;

  const mockLimitSelect = (rows: unknown[]): void => {
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(rows),
        }),
      }),
    });
  };

  const mockOrderedLimitSelect = (rows: unknown[]): void => {
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    });
  };

  const makeGatewaySubscription = (
    overrides: Partial<GatewaySubscription> = {},
  ): GatewaySubscription => ({
    id: 'sub_mock_1',
    customerId: 'cus_mock_1',
    priceId: 'price_mock_plus',
    status: 'active',
    currentPeriodStart: new Date('2026-11-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    metadata: { userId: '42', tier: 'dolly_plus', env: 'local' },
    defaultPaymentMethod: {
      id: 'pm_mock_1',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
    },
    ...overrides,
  });

  const makeGatewaySession = (
    overrides: Partial<GatewayCheckoutSession> = {},
  ): GatewayCheckoutSession => ({
    id: 'cs_mock_1',
    mode: 'subscription',
    status: 'complete',
    paymentStatus: 'paid',
    clientSecret: 'cs_secret_mock',
    url: null,
    customerId: 'cus_mock_1',
    subscriptionId: 'sub_mock_1',
    paymentIntentId: 'pi_mock_1',
    amountTotal: 14900,
    currency: 'mxn',
    metadata: { userId: '42', tier: 'dolly_plus', kind: 'subscription', env: 'local' },
    ...overrides,
  });

  beforeEach(() => {
    billingProvider = 'stripe';
    dbMock = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(dbMock)),
    };

    gateway = {
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_mock_1' }),
      retrievePrice: jest.fn((priceId: string) =>
        Promise.resolve({
          id: priceId,
          unitAmount:
            priceId === 'price_mock_pro' ? 24900 : priceId === 'price_mock_plus' ? 14900 : 4900,
          currency: 'mxn',
          interval: priceId === 'price_mock_unlock' ? null : 'month',
        }),
      ),
      createCheckoutSession: jest.fn().mockResolvedValue(makeGatewaySession()),
      retrieveCheckoutSession: jest.fn().mockResolvedValue(makeGatewaySession()),
      retrieveSubscription: jest.fn().mockResolvedValue(makeGatewaySubscription()),
      updateSubscriptionPlan: jest
        .fn()
        .mockResolvedValue(
          makeGatewaySubscription({ priceId: 'price_mock_pro', metadata: { tier: 'dolly_pro' } }),
        ),
      setSubscriptionCancelAtPeriodEnd: jest
        .fn()
        .mockResolvedValue(makeGatewaySubscription({ cancelAtPeriodEnd: true })),
      createSetupIntent: jest.fn().mockResolvedValue({
        id: 'seti_mock_1',
        clientSecret: 'seti_secret_mock',
        customerId: 'cus_mock_1',
      }),
      attachAndSetDefaultPaymentMethod: jest.fn().mockResolvedValue({
        id: 'pm_mock_1',
        brand: 'mastercard',
        last4: '5555',
        expMonth: 10,
        expYear: 2029,
      }),
      listInvoices: jest.fn().mockResolvedValue([]),
      createBillingPortalSession: jest
        .fn()
        .mockResolvedValue({ url: 'https://billing.stripe.com/p/session/mock' }),
      constructWebhookEvent: jest.fn(),
    };

    settings = {
      grantLanguageChangeCredit: jest.fn().mockResolvedValue({
        saved: ['en'],
        lastChangeAt: new Date(),
        previousCredits: 0,
        nextCredits: 1,
      }),
    };

    subscriptions = {
      assertSubscriptionActive: jest.fn().mockResolvedValue(SUBSCRIPTION_PLANS.dolly),
    };

    auditLogs = {
      logEvent: jest.fn().mockResolvedValue(undefined),
      logUpdate: jest.fn().mockResolvedValue(undefined),
    };

    errorLogs = {
      logError: jest.fn().mockResolvedValue(undefined),
    };

    rateLimiter = new BillingRateLimitService();

    configMock = {
      mail: {
        frontendBaseUrl: 'https://app.dolynation.test/',
      },
      get billing() {
        return {
          provider: billingProvider,
          envTag: 'local',
          currency: 'mxn',
          checkoutUiMode: 'custom' as const,
          stripe: {
            secretKey: 'stripe-mock-secret',
            publishableKey: 'stripe-mock-pk',
            webhookSecret: 'mock-webhook-secret',
            prices: {
              dolly: undefined,
              dollyPlus: 'price_mock_plus',
              dollyPro: 'price_mock_pro',
              languageUnlock: 'price_mock_unlock',
            },
          },
        };
      },
    } as unknown as AppConfigService;

    service = new BillingService(
      dbMock as unknown as DrizzleDb,
      configMock,
      gateway,
      settings as unknown as SettingsService,
      subscriptions as unknown as SubscriptionsService,
      auditLogs as unknown as AuditLogService,
      errorLogs as unknown as ErrorLogService,
      rateLimiter,
    );
  });

  describe('getPublicConfig', () => {
    it('returns manual config without calling Stripe when BILLING_PROVIDER=manual', async () => {
      billingProvider = 'manual';

      const res = await service.getPublicConfig();

      expect(gateway.retrievePrice).not.toHaveBeenCalled();
      expect(res.provider).toBe('manual');
      expect(res.plans.every((p) => !p.checkoutRequired)).toBe(true);
      expect(res.languageUnlock.checkoutRequired).toBe(false);
    });

    it('retrieves and caches Stripe prices for 5 minutes when BILLING_PROVIDER=stripe', async () => {
      const first = await service.getPublicConfig();
      const second = await service.getPublicConfig();

      expect(gateway.retrievePrice).toHaveBeenCalledTimes(3);
      expect(first.provider).toBe('stripe');
      expect(first.uiMode).toBe('custom');
      expect(first.plans).toEqual([
        {
          tier: 'dolly',
          isFree: true,
          checkoutRequired: false,
          amountCents: 0,
          currency: 'mxn',
          interval: null,
        },
        {
          tier: 'dolly_plus',
          isFree: false,
          checkoutRequired: true,
          amountCents: 14900,
          currency: 'mxn',
          interval: 'month',
        },
        {
          tier: 'dolly_pro',
          isFree: false,
          checkoutRequired: true,
          amountCents: 24900,
          currency: 'mxn',
          interval: 'month',
        },
      ]);
      expect(second.languageUnlock).toEqual({
        checkoutRequired: true,
        amountCents: 4900,
        currency: 'mxn',
      });
    });
  });

  describe('createSubscriptionCheckout', () => {
    it('throws 503 BILLING_NOT_CONFIGURED when provider is manual', async () => {
      billingProvider = 'manual';

      await expect(
        service.createSubscriptionCheckout(42, { tier: 'dolly_plus' }),
      ).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: ErrorCode.BILLING_NOT_CONFIGURED }),
      });
    });

    it('rejects non-paid tier (dolly) with SUBSCRIPTION_INVALID_TIER', async () => {
      await expect(
        service.createSubscriptionCheckout(42, { tier: 'dolly' as never }),
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: ErrorCode.SUBSCRIPTION_INVALID_TIER }),
      });
    });

    it('rejects duplicate checkout with 409 BILLING_SUBSCRIPTION_CONFLICT when user has an active paid sub', async () => {
      mockLimitSelect([{ id: 1, status: 'active' }]);

      await expect(
        service.createSubscriptionCheckout(42, { tier: 'dolly_pro' }),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: ErrorCode.BILLING_SUBSCRIPTION_CONFLICT }),
      });
      expect(gateway.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates Stripe customer if missing and returns CheckoutSessionResponseDto in custom mode', async () => {
      mockLimitSelect([]);
      mockLimitSelect([
        {
          id: 42,
          email: 'user@dolynation.test',
          fullName: 'Ada',
          locale: 'es',
          subscriptionTier: 'dolly',
          stripeCustomerId: null,
        },
      ]);
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ stripeCustomerId: 'cus_mock_1' }]),
          }),
        }),
      });

      const res = await service.createSubscriptionCheckout(
        42,
        { tier: 'dolly_plus' },
        'client-key-1',
      );

      expect(gateway.createCustomer).toHaveBeenCalledWith({
        email: 'user@dolynation.test',
        name: 'Ada',
        metadata: { userId: '42', env: 'local' },
        idempotencyKey: 'doly-cust-local-42',
      });
      expect(gateway.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cus_mock_1',
          mode: 'subscription',
          priceId: 'price_mock_plus',
          uiMode: 'custom',
          idempotencyKey: 'doly:local:u42:checkout_sub:client-key-1',
        }),
      );
      expect(res).toEqual({
        sessionId: 'cs_mock_1',
        clientSecret: 'cs_secret_mock',
        url: null,
        publishableKey: 'stripe-mock-pk',
        uiMode: 'custom',
        tier: 'dolly_plus',
      });
    });

    it('supports explicit hosted UI mode when requested by client', async () => {
      gateway.createCheckoutSession.mockResolvedValueOnce(
        makeGatewaySession({
          clientSecret: null,
          url: 'https://checkout.stripe.com/c/pay/cs_mock_1',
        }),
      );
      mockLimitSelect([]);
      mockLimitSelect([
        {
          id: 42,
          email: 'user@dolynation.test',
          fullName: 'Ada',
          locale: 'en',
          subscriptionTier: null,
          stripeCustomerId: 'cus_existing',
        },
      ]);

      const res = await service.createSubscriptionCheckout(42, {
        tier: 'dolly_plus',
        uiMode: 'hosted',
      });

      expect(gateway.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_existing', uiMode: 'hosted' }),
      );
      expect(res.uiMode).toBe('hosted');
      expect(res.url).toBe('https://checkout.stripe.com/c/pay/cs_mock_1');
      expect(res.clientSecret).toBeNull();
    });
  });

  describe('createLanguageUnlockCheckout', () => {
    it('verifies active subscription, creates payment checkout, and inserts pending billing_payments row', async () => {
      mockLimitSelect([
        {
          id: 42,
          email: 'user@dolynation.test',
          fullName: 'Ada',
          locale: 'es',
          subscriptionTier: 'dolly',
          stripeCustomerId: 'cus_existing',
        },
      ]);
      gateway.createCheckoutSession.mockResolvedValueOnce(
        makeGatewaySession({
          id: 'cs_unlock_1',
          mode: 'payment',
          subscriptionId: null,
          metadata: { userId: '42', kind: 'language_unlock', env: 'local' },
        }),
      );
      const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({ onConflictDoNothing }),
      });

      const res = await service.createLanguageUnlockCheckout(42, {});

      expect(subscriptions.assertSubscriptionActive).toHaveBeenCalledWith(42);
      expect(gateway.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cus_existing',
          mode: 'payment',
          priceId: 'price_mock_unlock',
          uiMode: 'custom',
        }),
      );
      expect(onConflictDoNothing).toHaveBeenCalled();
      expect(res.sessionId).toBe('cs_unlock_1');
      expect(res.tier).toBeNull();
    });
  });

  describe('syncCheckoutSession', () => {
    it('rejects sessions belonging to another user with 403 RESOURCE_FORBIDDEN', async () => {
      gateway.retrieveCheckoutSession.mockResolvedValueOnce(
        makeGatewaySession({ metadata: { userId: '999', env: 'local' } }),
      );

      await expect(service.syncCheckoutSession(42, 'cs_mock_1')).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({ code: ErrorCode.RESOURCE_FORBIDDEN }),
      });
    });

    it('rejects sessions from another BILLING_ENV_TAG with 400 BILLING_CHECKOUT_INVALID', async () => {
      gateway.retrieveCheckoutSession.mockResolvedValueOnce(
        makeGatewaySession({ metadata: { userId: '42', env: 'staging' } }),
      );

      await expect(service.syncCheckoutSession(42, 'cs_mock_1')).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: ErrorCode.BILLING_CHECKOUT_INVALID }),
      });
    });

    it('throws 402 BILLING_PAYMENT_REQUIRED when synchronous sync sees unpaid session', async () => {
      gateway.retrieveCheckoutSession.mockResolvedValueOnce(
        makeGatewaySession({ paymentStatus: 'unpaid' }),
      );

      await expect(service.syncCheckoutSession(42, 'cs_mock_1')).rejects.toMatchObject({
        status: 402,
        response: expect.objectContaining({ code: ErrorCode.BILLING_PAYMENT_REQUIRED }),
      });
    });

    it('fulfills language_unlock checkout once and avoids double credit when already fulfilled', async () => {
      const session = makeGatewaySession({
        id: 'cs_unlock_1',
        mode: 'payment',
        subscriptionId: null,
        metadata: { userId: '42', kind: 'language_unlock', env: 'local' },
      });
      gateway.retrieveCheckoutSession.mockResolvedValue(session);

      const mockTxForUnlock = (claimedRows: Array<{ id: number }>): void => {
        dbMock.insert.mockReturnValueOnce({
          values: jest.fn().mockReturnValue({
            onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
          }),
        });
        dbMock.update.mockReturnValueOnce({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue(claimedRows),
            }),
          }),
        });
      };

      const mockBillingStatusQueries = (): void => {
        mockLimitSelect([{ id: 42, subscriptionTier: 'dolly' }]);
        mockLimitSelect([]);
        mockOrderedLimitSelect([]);
      };

      // First call claims row (`[{ id: 1 }]`) and grants credit
      mockTxForUnlock([{ id: 1 }]);
      mockBillingStatusQueries();
      await service.syncCheckoutSession(42, 'cs_unlock_1');
      expect(settings.grantLanguageChangeCredit).toHaveBeenCalledTimes(1);

      // Second call gets empty claim (`[]`) because fulfilledAt IS NOT NULL
      mockTxForUnlock([]);
      mockBillingStatusQueries();
      await service.syncCheckoutSession(42, 'cs_unlock_1');
      expect(settings.grantLanguageChangeCredit).toHaveBeenCalledTimes(1);
    });
  });

  describe('in-app lifecycle management (changePlan, cancel, resume, PM, invoices, portal)', () => {
    const mockStatusQueries = (tier = 'dolly_pro', cancelAtPeriodEnd = false): void => {
      mockLimitSelect([{ id: 42, subscriptionTier: tier }]);
      mockLimitSelect([
        {
          id: 1,
          userId: 42,
          provider: 'stripe',
          stripeCustomerId: 'cus_mock_1',
          stripeSubscriptionId: 'sub_mock_1',
          stripePriceId: 'price_mock_pro',
          tier,
          status: 'active',
          currentPeriodStart: new Date('2026-11-01T00:00:00Z'),
          currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
          cancelAtPeriodEnd,
          canceledAt: null,
          paymentMethodBrand: 'visa',
          paymentMethodLast4: '4242',
          paymentMethodExpMonth: 12,
          paymentMethodExpYear: 2030,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockOrderedLimitSelect([]);
    };

    const mockSyncDbWrites = (): void => {
      mockLimitSelect([{ subscriptionTier: 'dolly_plus', stripeCustomerId: 'cus_mock_1' }]);
      mockLimitSelect([]);
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        }),
      });
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });
    };

    it('changePlan throws 402 when no active paid subscription exists', async () => {
      mockLimitSelect([]);

      await expect(service.changePlan(42, { tier: 'dolly_pro' })).rejects.toMatchObject({
        status: 402,
        response: expect.objectContaining({ code: ErrorCode.BILLING_PAYMENT_REQUIRED }),
      });
    });

    it('changePlan upgrades active subscription in-app via gateway', async () => {
      mockLimitSelect([
        {
          id: 1,
          userId: 42,
          stripeCustomerId: 'cus_mock_1',
          stripeSubscriptionId: 'sub_mock_1',
          tier: 'dolly_plus',
          status: 'active',
          cancelAtPeriodEnd: false,
        },
      ]);
      mockSyncDbWrites();
      mockStatusQueries('dolly_pro', false);

      const res = await service.changePlan(42, { tier: 'dolly_pro' });

      expect(gateway.updateSubscriptionPlan).toHaveBeenCalledWith({
        subscriptionId: 'sub_mock_1',
        newPriceId: 'price_mock_pro',
        metadata: { userId: '42', tier: 'dolly_pro', env: 'local' },
      });
      expect(res.tier).toBe('dolly_pro');
    });

    it('cancelSubscription throws 404 when no active sub and sets cancelAtPeriodEnd=true when present', async () => {
      mockLimitSelect([]);
      await expect(service.cancelSubscription(42)).rejects.toBeInstanceOf(AppHttpException);

      mockLimitSelect([
        {
          id: 1,
          userId: 42,
          stripeSubscriptionId: 'sub_mock_1',
          tier: 'dolly_plus',
          status: 'active',
          cancelAtPeriodEnd: false,
        },
      ]);
      mockSyncDbWrites();
      mockStatusQueries('dolly_plus', true);

      const res = await service.cancelSubscription(42);
      expect(gateway.setSubscriptionCancelAtPeriodEnd).toHaveBeenCalledWith({
        subscriptionId: 'sub_mock_1',
        cancelAtPeriodEnd: true,
      });
      expect(res.subscription?.cancelAtPeriodEnd).toBe(true);
    });

    it('resumeSubscription sets cancelAtPeriodEnd=false when scheduled for cancellation', async () => {
      mockLimitSelect([
        {
          id: 1,
          userId: 42,
          stripeSubscriptionId: 'sub_mock_1',
          tier: 'dolly_plus',
          status: 'active',
          cancelAtPeriodEnd: true,
        },
      ]);
      gateway.setSubscriptionCancelAtPeriodEnd.mockResolvedValueOnce(
        makeGatewaySubscription({ cancelAtPeriodEnd: false }),
      );
      mockSyncDbWrites();
      mockStatusQueries('dolly_plus', false);

      const res = await service.resumeSubscription(42);
      expect(gateway.setSubscriptionCancelAtPeriodEnd).toHaveBeenCalledWith({
        subscriptionId: 'sub_mock_1',
        cancelAtPeriodEnd: false,
      });
      expect(res.subscription?.cancelAtPeriodEnd).toBe(false);
    });

    it('createSetupIntent returns clientSecret and setDefaultPaymentMethod updates stored card summary', async () => {
      mockLimitSelect([
        {
          id: 42,
          email: 'u@test.dev',
          fullName: 'U',
          locale: 'es',
          subscriptionTier: 'dolly_plus',
          stripeCustomerId: 'cus_mock_1',
        },
      ]);
      const intent = await service.createSetupIntent(42);
      expect(intent).toEqual({
        setupIntentId: 'seti_mock_1',
        clientSecret: 'seti_secret_mock',
        publishableKey: 'stripe-mock-pk',
      });

      mockLimitSelect([
        {
          id: 42,
          email: 'u@test.dev',
          fullName: 'U',
          locale: 'es',
          subscriptionTier: 'dolly_plus',
          stripeCustomerId: 'cus_mock_1',
        },
      ]);
      mockLimitSelect([{ id: 7, stripeSubscriptionId: 'sub_mock_1', status: 'active' }]);
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      const pm = await service.setDefaultPaymentMethod(42, { paymentMethodId: ' pm_new ' });
      expect(gateway.attachAndSetDefaultPaymentMethod).toHaveBeenCalledWith({
        customerId: 'cus_mock_1',
        paymentMethodId: 'pm_new',
        subscriptionId: 'sub_mock_1',
      });
      expect(pm).toEqual({ brand: 'mastercard', last4: '5555', expMonth: 10, expYear: 2029 });
    });

    it('listInvoices returns empty list without Stripe call when user has no stripeCustomerId and maps invoices otherwise', async () => {
      mockLimitSelect([{ stripeCustomerId: null }]);
      await expect(service.listInvoices(42)).resolves.toEqual([]);
      expect(gateway.listInvoices).not.toHaveBeenCalled();

      const invoice: GatewayInvoice = {
        id: 'in_mock_1',
        number: 'DOLY-0001',
        status: 'paid',
        amountPaidCents: 14900,
        amountDueCents: 14900,
        currency: 'mxn',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        invoicePdfUrl: 'https://pay.stripe.com/in_mock_1.pdf',
        hostedInvoiceUrl: 'https://invoice.stripe.com/in_mock_1',
        subscriptionId: 'sub_mock_1',
        customerId: 'cus_mock_1',
        metadata: {},
      };
      mockLimitSelect([{ stripeCustomerId: 'cus_mock_1' }]);
      gateway.listInvoices.mockResolvedValueOnce([invoice]);

      const invoices = await service.listInvoices(42);
      expect(invoices).toHaveLength(1);
      expect(invoices[0]?.id).toBe('in_mock_1');
    });

    it('createPortalSession generates returnUrl to frontend profile subscription section', async () => {
      mockLimitSelect([
        {
          id: 42,
          email: 'u@test.dev',
          fullName: 'U',
          locale: 'es',
          subscriptionTier: 'dolly_plus',
          stripeCustomerId: 'cus_mock_1',
        },
      ]);

      const portal = await service.createPortalSession(42);

      expect(gateway.createBillingPortalSession).toHaveBeenCalledWith({
        customerId: 'cus_mock_1',
        returnUrl: 'https://app.dolynation.test/profile#subscription',
      });
      expect(portal.url).toBe('https://billing.stripe.com/p/session/mock');
    });
  });

  describe('handleWebhook', () => {
    it('rejects missing stripe-signature with 400 BILLING_WEBHOOK_SIGNATURE_INVALID and empty rawBody with 400 BILLING_CHECKOUT_INVALID', async () => {
      await expect(service.handleWebhook(Buffer.from('{}'), '')).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: ErrorCode.BILLING_WEBHOOK_SIGNATURE_INVALID }),
      });

      await expect(service.handleWebhook(Buffer.alloc(0), 't=1,v1=sig')).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: ErrorCode.BILLING_CHECKOUT_INVALID }),
      });
    });

    it('ignores events tagged for a different BILLING_ENV_TAG without touching billing_webhook_events', async () => {
      const event: GatewayWebhookEvent = {
        id: 'evt_other_env',
        type: 'checkout.session.completed',
        envTag: 'staging',
      };
      gateway.constructWebhookEvent.mockReturnValueOnce(event);

      const res = await service.handleWebhook(Buffer.from('{"id":"evt_other_env"}'), 'sig');

      expect(res).toEqual({ received: true, ignored: true });
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('deduplicates already-processed event IDs and retries previously failed events', async () => {
      const event: GatewayWebhookEvent = {
        id: 'evt_dup',
        type: 'customer.subscription.updated',
        envTag: 'local',
        subscription: makeGatewaySubscription(),
      };
      gateway.constructWebhookEvent.mockReturnValue(event);

      // Duplicate already processed -> ignored
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      mockLimitSelect([{ status: 'processed' }]);

      const dupRes = await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(dupRes).toEqual({ received: true, ignored: true });

      // Failed event retry -> reclaims and processes
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      mockLimitSelect([{ status: 'failed' }]);
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ eventId: 'evt_dup' }]),
          }),
        }),
      });
      // syncSubscriptionState tx + final processed update
      mockLimitSelect([{ subscriptionTier: 'dolly', stripeCustomerId: 'cus_mock_1' }]);
      mockLimitSelect([]);
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        }),
      });
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      const retryRes = await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(retryRes).toEqual({ received: true, ignored: false });
    });

    it('marks event as failed and logs to ErrorLogService when processing throws', async () => {
      gateway.constructWebhookEvent.mockReturnValueOnce({
        id: 'evt_fail',
        type: 'customer.subscription.updated',
        envTag: 'local',
        subscription: makeGatewaySubscription(),
      });
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ eventId: 'evt_fail' }]),
          }),
        }),
      });
      dbMock.transaction.mockRejectedValueOnce(new Error('db write failure'));
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow(
        'db write failure',
      );
      expect(errorLogs.logError).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'billing_provider', module: 'billing' }),
      );
    });

    it('downgrades user subscriptionTier to dolly on customer.subscription.deleted without altering user_settings', async () => {
      gateway.constructWebhookEvent.mockReturnValueOnce({
        id: 'evt_deleted',
        type: 'customer.subscription.deleted',
        envTag: 'local',
        subscription: makeGatewaySubscription({ status: 'canceled' }),
      });

      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ eventId: 'evt_deleted' }]),
          }),
        }),
      });
      mockLimitSelect([{ subscriptionTier: 'dolly_pro', stripeCustomerId: 'cus_mock_1' }]);
      mockLimitSelect([]);
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        }),
      });
      const userSetMock = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });
      dbMock.update.mockReturnValueOnce({ set: userSetMock });
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(res).toEqual({ received: true, ignored: false });
      expect(userSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionTier: 'dolly' }),
      );
      expect(settings.grantLanguageChangeCredit).not.toHaveBeenCalled();
    });
  });

  describe('money-flow hardening (concurrency, guards, rate limiting, idempotency)', () => {
    it('coalesces concurrent cold-start getPublicConfig price lookups to one gateway call per price', async () => {
      const [first, second] = await Promise.all([
        service.getPublicConfig(),
        service.getPublicConfig(),
      ]);

      expect(gateway.retrievePrice).toHaveBeenCalledTimes(3);
      expect(first.plans).toEqual(second.plans);
    });

    it('deduplicates concurrent customer creation calls for the same user', async () => {
      mockLimitSelect([
        {
          id: 42,
          email: 'user@dolynation.test',
          fullName: 'Ada',
          locale: 'es',
          subscriptionTier: 'dolly',
          stripeCustomerId: null,
        },
      ]);
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ stripeCustomerId: 'cus_mock_1' }]),
          }),
        }),
      });

      const [a, b] = await Promise.all([
        service.createPortalSession(42),
        service.createPortalSession(42),
      ]);

      expect(gateway.createCustomer).toHaveBeenCalledTimes(1);
      expect(a.url).toBe(b.url);
    });

    it('rejects malformed checkout sessionId in syncCheckoutSession before calling Stripe', async () => {
      await expect(service.syncCheckoutSession(42, 'bad-session-id')).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: ErrorCode.BILLING_CHECKOUT_INVALID }),
      });
      expect(gateway.retrieveCheckoutSession).not.toHaveBeenCalled();
    });

    it('rejects invalid Idempotency-Key header characters with 400 VALIDATION_ERROR', async () => {
      await expect(
        service.createSubscriptionCheckout(42, { tier: 'dolly_plus' }, 'invalid key with spaces!'),
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      });
      expect(gateway.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('blocks changePlan with 402 BILLING_PAYMENT_REQUIRED when subscription status is past_due', async () => {
      mockLimitSelect([
        {
          id: 1,
          userId: 42,
          stripeCustomerId: 'cus_mock_1',
          stripeSubscriptionId: 'sub_mock_1',
          tier: 'dolly_plus',
          status: 'past_due',
          cancelAtPeriodEnd: false,
        },
      ]);

      await expect(service.changePlan(42, { tier: 'dolly_pro' })).rejects.toMatchObject({
        status: 402,
        response: expect.objectContaining({
          code: ErrorCode.BILLING_PAYMENT_REQUIRED,
          details: expect.objectContaining({ reason: 'subscription_past_due' }),
        }),
      });
      expect(gateway.updateSubscriptionPlan).not.toHaveBeenCalled();
    });

    it('ignores stale out-of-order customer.subscription.deleted webhook when a newer active subscription exists', async () => {
      gateway.constructWebhookEvent.mockReturnValueOnce({
        id: 'evt_stale_del',
        type: 'customer.subscription.deleted',
        envTag: 'local',
        subscription: makeGatewaySubscription({
          id: 'sub_old_1',
          status: 'canceled',
        }),
      });
      dbMock.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ eventId: 'evt_stale_del' }]),
          }),
        }),
      });
      mockLimitSelect([{ subscriptionTier: 'dolly_pro', stripeCustomerId: 'cus_mock_1' }]);
      mockLimitSelect([{ stripeSubscriptionId: 'sub_newer_2', status: 'active' }]);
      const markProcessedWhere = jest.fn().mockResolvedValue(undefined);
      dbMock.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValue({ where: markProcessedWhere }),
      });

      const res = await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(res).toEqual({ received: true, ignored: false });
      // No upsert on billingSubscriptions and no downgrade update on users
      expect(dbMock.insert).toHaveBeenCalledTimes(1);
      expect(dbMock.update).toHaveBeenCalledTimes(1);
    });

    it('enforces per-user rate limits with 429 BILLING_RATE_LIMITED on setupIntent bursts', async () => {
      for (let i = 0; i < BILLING_RATE_LIMITS.setup_intent.maxRequests; i++) {
        mockLimitSelect([
          {
            id: 42,
            email: 'u@test.dev',
            fullName: 'U',
            locale: 'es',
            subscriptionTier: 'dolly_plus',
            stripeCustomerId: 'cus_mock_1',
          },
        ]);
        await service.createSetupIntent(42);
      }

      await expect(service.createSetupIntent(42)).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({ code: ErrorCode.BILLING_RATE_LIMITED }),
      });
    });
  });
});
