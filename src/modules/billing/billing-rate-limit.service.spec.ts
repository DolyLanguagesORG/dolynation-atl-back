import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { BILLING_RATE_LIMITS, BillingRateLimitService } from './billing-rate-limit.service';

describe('BillingRateLimitService', () => {
  let service: BillingRateLimitService;

  beforeEach(() => {
    service = new BillingRateLimitService();
  });

  it('allows up to the configured per-action limit and blocks excess calls with 429 BILLING_RATE_LIMITED', () => {
    const baseTime = 1_700_000_000_000;
    const limit = BILLING_RATE_LIMITS.checkout.maxRequests;

    for (let i = 0; i < limit; i++) {
      expect(() => service.assertWithinLimit(42, 'checkout', baseTime + i * 100)).not.toThrow();
    }

    let caught: AppHttpException | null = null;
    try {
      service.assertWithinLimit(42, 'checkout', baseTime + 2_000);
    } catch (err) {
      caught = err as AppHttpException;
    }

    expect(caught).toBeInstanceOf(AppHttpException);
    expect(caught?.getStatus()).toBe(429);
    expect(caught?.getResponse()).toMatchObject({
      code: ErrorCode.BILLING_RATE_LIMITED,
      details: expect.objectContaining({
        action: 'checkout',
        limit,
        windowSeconds: 60,
        retryAfterSeconds: expect.any(Number),
      }),
    });

    // Another user or action stays unaffected
    expect(() => service.assertWithinLimit(99, 'checkout', baseTime + 2_000)).not.toThrow();
    expect(() => service.assertWithinLimit(42, 'sync', baseTime + 2_000)).not.toThrow();
  });

  it('recovers once the 60s sliding window expires and clears state on reset()', () => {
    const baseTime = 1_700_000_000_000;
    const limit = BILLING_RATE_LIMITS.setup_intent.maxRequests;

    for (let i = 0; i < limit; i++) {
      service.assertWithinLimit(7, 'setup_intent', baseTime + i * 10);
    }
    expect(() => service.assertWithinLimit(7, 'setup_intent', baseTime + 5_000)).toThrow(
      AppHttpException,
    );

    // After full 60s window elapsed, quota opens again
    expect(() => service.assertWithinLimit(7, 'setup_intent', baseTime + 60_500)).not.toThrow();

    service.reset();
    for (let i = 0; i < limit; i++) {
      expect(() =>
        service.assertWithinLimit(7, 'setup_intent', baseTime + 60_500 + i),
      ).not.toThrow();
    }
  });
});
