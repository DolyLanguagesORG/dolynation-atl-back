import type { AppConfigService } from '../../../config/env.config';
import { DEFAULT_INVOICES_LIMIT } from '../billing.constants';
import { StripeGateway } from './stripe.gateway';

describe('StripeGateway', () => {
  const createConfiguredGateway = () => {
    const config = {
      billing: {
        stripe: {
          secretKey: 'sk_test_fake_gateway',
          webhookSecret: 'whsec_test_fake_gateway',
        },
      },
    } as unknown as AppConfigService;

    const gateway = new StripeGateway(config);
    const subscriptionsRetrieve = jest.fn().mockResolvedValue({
      id: 'sub_123',
      items: { data: [{ id: 'si_123' }] },
    });
    const subscriptionsUpdate = jest.fn().mockResolvedValue({
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: true,
      canceled_at: null,
      metadata: { tier: 'dolly_pro' },
      items: {
        data: [
          {
            price: { id: 'price_pro' },
            current_period_start: 1_760_000_000,
            current_period_end: 1_762_678_400,
          },
        ],
      },
      default_payment_method: null,
    });
    const invoicesList = jest.fn().mockResolvedValue({ data: [] });

    const internal = gateway as unknown as {
      client: {
        subscriptions: { retrieve: jest.Mock; update: jest.Mock };
        invoices: { list: jest.Mock };
      };
      clientSecretKey: string;
    };
    internal.clientSecretKey = 'sk_test_fake_gateway';
    internal.client = {
      subscriptions: {
        retrieve: subscriptionsRetrieve,
        update: subscriptionsUpdate,
      },
      invoices: {
        list: invoicesList,
      },
    };

    return { gateway, subscriptionsRetrieve, subscriptionsUpdate, invoicesList };
  };

  it('updateSubscriptionPlan omits cancel_at_period_end so a scheduled cancellation is preserved (M-6)', async () => {
    const { gateway, subscriptionsRetrieve, subscriptionsUpdate } = createConfiguredGateway();

    const updated = await gateway.updateSubscriptionPlan({
      subscriptionId: 'sub_123',
      newPriceId: 'price_pro',
      metadata: { userId: '42', tier: 'dolly_pro', env: 'test' },
      idempotencyKey: 'idem-plan-1',
    });

    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
    expect(subscriptionsUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = subscriptionsUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updatePayload).not.toHaveProperty('cancel_at_period_end');
    expect(updatePayload).toMatchObject({
      items: [{ id: 'si_123', price: 'price_pro' }],
      proration_behavior: 'create_prorations',
      payment_behavior: 'pending_if_incomplete',
    });
    expect(subscriptionsUpdate.mock.calls[0]?.[2]).toEqual({ idempotencyKey: 'idem-plan-1' });
    expect(updated.cancelAtPeriodEnd).toBe(true);
  });

  it('listInvoices defaults limit to DEFAULT_INVOICES_LIMIT and forwards limit and startingAfter cursor (B-3)', async () => {
    const { gateway, invoicesList } = createConfiguredGateway();

    await gateway.listInvoices({ customerId: 'cus_123' });
    expect(invoicesList).toHaveBeenNthCalledWith(1, {
      customer: 'cus_123',
      limit: DEFAULT_INVOICES_LIMIT,
      expand: ['data.payments.data.payment'],
    });

    await gateway.listInvoices({
      customerId: 'cus_123',
      limit: 50,
      startingAfter: 'in_cursor_99',
    });
    expect(invoicesList).toHaveBeenNthCalledWith(2, {
      customer: 'cus_123',
      limit: 50,
      starting_after: 'in_cursor_99',
      expand: ['data.payments.data.payment'],
    });
  });
});
