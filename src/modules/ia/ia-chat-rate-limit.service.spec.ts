import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  IA_CHAT_MAX_REQUESTS,
  IA_CHAT_WINDOW_MS,
  IaChatRateLimitService,
} from './ia-chat-rate-limit.service';

describe('IaChatRateLimitService', () => {
  let limiter: IaChatRateLimitService;
  const t0 = 1_000_000;

  beforeEach(() => {
    limiter = new IaChatRateLimitService();
  });

  const fill = (userId: number, at = t0): void => {
    for (let i = 0; i < IA_CHAT_MAX_REQUESTS; i += 1) {
      limiter.assertWithinLimit(userId, at + i);
    }
  };

  it('allows up to the limit and rejects the next call with AI_RATE_LIMITED (429)', () => {
    fill(42);

    let caught: unknown;
    try {
      limiter.assertWithinLimit(42, t0 + IA_CHAT_MAX_REQUESTS);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppHttpException);
    const exception = caught as AppHttpException;
    expect(exception.getStatus()).toBe(429);
    expect(exception.getResponse()).toMatchObject({ code: ErrorCode.AI_RATE_LIMITED });
  });

  it('tracks each user independently', () => {
    fill(42);
    expect(() => limiter.assertWithinLimit(7, t0)).not.toThrow();
  });

  it('frees the quota once the window has passed', () => {
    fill(42);
    expect(() => limiter.assertWithinLimit(42, t0 + IA_CHAT_WINDOW_MS + 100)).not.toThrow();
  });
});
