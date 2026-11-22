import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { CaptchaGuard } from './captcha.guard';
import type { CaptchaService } from './captcha.service';
import { REQUIRE_CAPTCHA_KEY } from './decorators/require-captcha.decorator';

describe('CaptchaGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let captchaService: { verifyToken: jest.Mock };
  let guard: CaptchaGuard;

  const createContext = (
    headers: Record<string, string | string[] | undefined>,
  ): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ headers, ip: '127.0.0.1' }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    captchaService = { verifyToken: jest.fn().mockResolvedValue(undefined) };
    guard = new CaptchaGuard(
      reflector as unknown as Reflector,
      captchaService as unknown as CaptchaService,
    );
  });

  it('passes through when route has no @RequireCaptcha metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(captchaService.verifyToken).not.toHaveBeenCalled();
  });

  it('extracts X-Captcha-Token and client IP (CF-Connecting-IP) and delegates to CaptchaService', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === REQUIRE_CAPTCHA_KEY ? 'register' : undefined,
    );

    const ctx = createContext({
      'x-captcha-token': 'turnstile-token-123',
      'cf-connecting-ip': '203.0.113.55',
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(captchaService.verifyToken).toHaveBeenCalledWith({
      token: 'turnstile-token-123',
      expectedAction: 'register',
      clientIp: '203.0.113.55',
    });
  });

  it('handles array header values cleanly', async () => {
    reflector.getAllAndOverride.mockReturnValue('login');
    const ctx = createContext({
      'x-captcha-token': ['first-token', 'second-token'],
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(captchaService.verifyToken).toHaveBeenCalledWith({
      token: 'first-token',
      expectedAction: 'login',
      clientIp: '127.0.0.1',
    });
  });
});
