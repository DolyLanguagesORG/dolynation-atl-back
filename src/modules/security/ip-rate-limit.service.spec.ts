import type { AppConfigService } from '../../config/env.config';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { IpRateLimitService } from './ip-rate-limit.service';

describe('IpRateLimitService', () => {
  const makeService = (enabled: boolean): IpRateLimitService =>
    new IpRateLimitService({ ipRateLimitEnabled: enabled } as unknown as AppConfigService);

  it('does nothing when ipRateLimitEnabled is false', () => {
    const svc = makeService(false);
    const rule = { action: 'auth_login', maxRequests: 1, windowMs: 60_000 };

    expect(() => {
      svc.assertWithinLimit('198.51.100.1', rule, 1000);
      svc.assertWithinLimit('198.51.100.1', rule, 1001);
      svc.assertWithinLimit('198.51.100.1', rule, 1002);
    }).not.toThrow();
  });

  it('allows up to maxRequests and throws 429 RATE_LIMIT_EXCEEDED afterwards until window expires', () => {
    const svc = makeService(true);
    const rule = { action: 'auth_register', maxRequests: 2, windowMs: 60_000 };

    svc.assertWithinLimit('203.0.113.10', rule, 1000);
    svc.assertWithinLimit('203.0.113.10', rule, 2000);

    try {
      svc.assertWithinLimit('203.0.113.10', rule, 3000);
      fail('expected 429');
    } catch (err) {
      expect(err).toBeInstanceOf(AppHttpException);
      expect((err as AppHttpException).getStatus()).toBe(429);
      expect((err as AppHttpException).getResponse()).toMatchObject({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        details: expect.objectContaining({
          action: 'auth_register',
          limit: 2,
          windowSeconds: 60,
        }),
      });
    }

    // Different IP is unaffected
    expect(() => svc.assertWithinLimit('203.0.113.11', rule, 3000)).not.toThrow();

    // Window slides past first attempt
    expect(() => svc.assertWithinLimit('203.0.113.10', rule, 62_000)).not.toThrow();
  });
});
