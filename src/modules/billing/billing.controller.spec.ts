import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { IP_RATE_LIMIT_KEY } from '../security/decorators/rate-limit-by-ip.decorator';
import { BillingController } from './billing.controller';
import type { BillingService } from './billing.service';

describe('BillingController', () => {
  const user: AuthUser = {
    id: 42,
    email: 'user@dolynation.test',
    fullName: 'Ada Lovelace',
    role: 'student',
  };

  const billingMock: {
    getPublicConfig: jest.Mock;
    createSubscriptionCheckout: jest.Mock;
    createLanguageUnlockCheckout: jest.Mock;
    syncCheckoutSession: jest.Mock;
    getBillingStatus: jest.Mock;
    changePlan: jest.Mock;
    cancelSubscription: jest.Mock;
    resumeSubscription: jest.Mock;
    createSetupIntent: jest.Mock;
    setDefaultPaymentMethod: jest.Mock;
    listInvoices: jest.Mock;
    createPortalSession: jest.Mock;
    handleWebhook: jest.Mock;
  } = {
    getPublicConfig: jest.fn(),
    createSubscriptionCheckout: jest.fn(),
    createLanguageUnlockCheckout: jest.fn(),
    syncCheckoutSession: jest.fn(),
    getBillingStatus: jest.fn(),
    changePlan: jest.fn(),
    cancelSubscription: jest.fn(),
    resumeSubscription: jest.fn(),
    createSetupIntent: jest.fn(),
    setDefaultPaymentMethod: jest.fn(),
    listInvoices: jest.fn(),
    createPortalSession: jest.fn(),
    handleWebhook: jest.fn(),
  };

  let controller: BillingController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BillingController(billingMock as unknown as BillingService);
  });

  it('delegates all 13 endpoints to BillingService wrapped in apiOk envelopes', async () => {
    billingMock.getPublicConfig.mockResolvedValue({
      provider: 'stripe',
      publishableKey: 'stripe-mock-pk',
      currency: 'mxn',
      uiMode: 'custom',
      plans: [],
      languageUnlock: { checkoutRequired: true, amountCents: 4900, currency: 'mxn' },
    });
    expect(await controller.getConfig()).toEqual({
      message: 'Billing configuration',
      data: expect.objectContaining({ provider: 'stripe' }),
    });

    const checkoutData = {
      sessionId: 'cs_1',
      clientSecret: 'cs_secret_1',
      url: null,
      publishableKey: 'stripe-mock-pk',
      uiMode: 'custom' as const,
      tier: 'dolly_plus' as const,
    };
    billingMock.createSubscriptionCheckout.mockResolvedValue(checkoutData);
    expect(
      await controller.createSubscriptionCheckout(
        user,
        { tier: 'dolly_plus', uiMode: 'custom' },
        'idem-sub-1',
      ),
    ).toEqual({
      message: 'Subscription checkout session created',
      data: checkoutData,
    });
    expect(billingMock.createSubscriptionCheckout).toHaveBeenCalledWith(
      42,
      { tier: 'dolly_plus', uiMode: 'custom' },
      'idem-sub-1',
    );

    billingMock.createLanguageUnlockCheckout.mockResolvedValue({ ...checkoutData, tier: null });
    expect(await controller.createLanguageUnlockCheckout(user, {}, 'idem-unlock-1')).toEqual({
      message: 'Language unlock checkout session created',
      data: expect.objectContaining({ sessionId: 'cs_1', tier: null }),
    });
    expect(billingMock.createLanguageUnlockCheckout).toHaveBeenCalledWith(42, {}, 'idem-unlock-1');

    const statusData = {
      provider: 'stripe' as const,
      tier: 'dolly_plus' as const,
      subscription: null,
      recentPayments: [],
    };
    billingMock.syncCheckoutSession.mockResolvedValue(statusData);
    expect(await controller.syncCheckoutSession(user, 'cs_1')).toEqual({
      message: 'Checkout session synchronized',
      data: statusData,
    });
    expect(billingMock.syncCheckoutSession).toHaveBeenCalledWith(42, 'cs_1');

    billingMock.getBillingStatus.mockResolvedValue(statusData);
    expect(await controller.getStatus(user)).toEqual({
      message: 'Billing status',
      data: statusData,
    });
    expect(billingMock.getBillingStatus).toHaveBeenCalledWith(42);

    billingMock.changePlan.mockResolvedValue(statusData);
    expect(await controller.changePlan(user, { tier: 'dolly_pro' }, 'idem-plan-1')).toEqual({
      message: 'Subscription plan updated',
      data: statusData,
    });
    expect(billingMock.changePlan).toHaveBeenCalledWith(42, { tier: 'dolly_pro' }, 'idem-plan-1');

    billingMock.cancelSubscription.mockResolvedValue(statusData);
    expect(await controller.cancelSubscription(user)).toEqual({
      message: 'Subscription scheduled for cancellation at period end',
      data: statusData,
    });
    expect(billingMock.cancelSubscription).toHaveBeenCalledWith(42);

    billingMock.resumeSubscription.mockResolvedValue(statusData);
    expect(await controller.resumeSubscription(user)).toEqual({
      message: 'Subscription resumed',
      data: statusData,
    });
    expect(billingMock.resumeSubscription).toHaveBeenCalledWith(42);

    const intentData = {
      setupIntentId: 'seti_1',
      clientSecret: 'seti_secret_1',
      publishableKey: 'stripe-mock-pk',
    };
    billingMock.createSetupIntent.mockResolvedValue(intentData);
    expect(await controller.createSetupIntent(user, 'idem-setup-1')).toEqual({
      message: 'Setup intent created',
      data: intentData,
    });
    expect(billingMock.createSetupIntent).toHaveBeenCalledWith(42, 'idem-setup-1');

    const pmData = { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 };
    billingMock.setDefaultPaymentMethod.mockResolvedValue(pmData);
    expect(await controller.setDefaultPaymentMethod(user, { paymentMethodId: 'pm_1' })).toEqual({
      message: 'Default payment method updated',
      data: pmData,
    });
    expect(billingMock.setDefaultPaymentMethod).toHaveBeenCalledWith(42, {
      paymentMethodId: 'pm_1',
    });

    billingMock.listInvoices.mockResolvedValue([]);
    expect(await controller.listInvoices(user)).toEqual({
      message: 'Billing invoices',
      data: [],
    });
    expect(billingMock.listInvoices).toHaveBeenCalledWith(42);

    expect(await controller.listInvoices(user, { limit: 10, startingAfter: 'in_1' })).toEqual({
      message: 'Billing invoices',
      data: [],
    });
    expect(billingMock.listInvoices).toHaveBeenLastCalledWith(42, {
      limit: 10,
      startingAfter: 'in_1',
    });

    billingMock.createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/p/1' });
    expect(await controller.createPortal(user)).toEqual({
      message: 'Billing portal session created',
      data: { url: 'https://billing.stripe.com/p/1' },
    });
    expect(billingMock.createPortalSession).toHaveBeenCalledWith(42);

    const rawBody = Buffer.from('{"id":"evt_1"}');
    billingMock.handleWebhook.mockResolvedValue({ received: true, ignored: false });
    expect(
      await controller.handleWebhook({ rawBody } as RawBodyRequest<Request>, 't=1,v1=sig'),
    ).toEqual({
      message: 'Webhook processed',
      data: { received: true, ignored: false },
    });
    expect(billingMock.handleWebhook).toHaveBeenCalledWith(rawBody, 't=1,v1=sig');

    const webhookHandler = Object.getOwnPropertyDescriptor(
      BillingController.prototype,
      'handleWebhook',
    )?.value as object;
    expect(Reflect.getMetadata(IP_RATE_LIMIT_KEY, webhookHandler)).toEqual({
      action: 'billing_webhook',
      maxRequests: 120,
      windowMs: 60_000,
    });
  });
});
