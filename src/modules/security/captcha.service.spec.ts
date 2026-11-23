import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/env.config';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuditLogService } from '../logs';
import { CaptchaService } from './captcha.service';

describe('CaptchaService', () => {
  const baseCaptchaConfig: AppConfigService['captcha'] = {
    provider: 'turnstile',
    enabled: true,
    siteKey: 'site-key-real',
    secretKey: 'secret-key-real',
    appearance: 'interaction-only',
    allowedHostnames: ['devplay.dolynation.app', 'localhost'],
    verifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    timeoutMs: 5000,
    failOpen: false,
  };

  let auditLogsMock: { logEvent: jest.Mock };
  let fetchSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const makeService = (overrides?: Partial<AppConfigService['captcha']>): CaptchaService => {
    const configMock = {
      captcha: {
        ...baseCaptchaConfig,
        ...overrides,
      },
    } as unknown as AppConfigService;
    return new CaptchaService(configMock, auditLogsMock as unknown as AuditLogService);
  };

  beforeEach(() => {
    auditLogsMock = { logEvent: jest.fn().mockResolvedValue(undefined) };
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('returns public config without leaking secretKey and hides siteKey when disabled', () => {
    const enabledSvc = makeService();
    expect(enabledSvc.getPublicConfig()).toEqual({
      enabled: true,
      provider: 'turnstile',
      siteKey: 'site-key-real',
      appearance: 'interaction-only',
    });

    const disabledSvc = makeService({ enabled: false, provider: 'disabled', siteKey: 'ignored' });
    expect(disabledSvc.getPublicConfig()).toEqual({
      enabled: false,
      provider: 'disabled',
      siteKey: null,
      appearance: 'interaction-only',
    });
  });

  it('skips verification completely when captcha is disabled', async () => {
    const svc = makeService({ enabled: false, provider: 'disabled' });
    await expect(
      svc.verifyToken({ token: undefined, expectedAction: 'login', clientIp: '203.0.113.10' }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws 400 CAPTCHA_REQUIRED when token is missing or too long', async () => {
    const svc = makeService();

    await expect(
      svc.verifyToken({ token: '   ', expectedAction: 'register', clientIp: '203.0.113.10' }),
    ).rejects.toThrow(AppHttpException);

    try {
      await svc.verifyToken({ token: '', expectedAction: 'register', clientIp: null });
    } catch (err) {
      expect(err).toBeInstanceOf(AppHttpException);
      expect((err as AppHttpException).getStatus()).toBe(400);
      expect((err as AppHttpException).getResponse()).toMatchObject({
        code: ErrorCode.CAPTCHA_REQUIRED,
      });
    }

    try {
      await svc.verifyToken({
        token: 'x'.repeat(2049),
        expectedAction: 'register',
        clientIp: null,
      });
    } catch (err) {
      expect((err as AppHttpException).getResponse()).toMatchObject({
        code: ErrorCode.CAPTCHA_REQUIRED,
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(auditLogsMock.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'security',
        event: 'security.captcha_missing',
      }),
    );
  });

  it('accepts a valid Turnstile token matching expectedAction and allowedHostnames', async () => {
    const svc = makeService();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: 'login',
          hostname: 'devplay.dolynation.app',
          'error-codes': [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      svc.verifyToken({
        token: 'valid-cf-token',
        expectedAction: 'login',
        clientIp: '198.51.100.7',
      }),
    ).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const rawBody = typeof init.body === 'string' ? init.body : '{}';
    const body = JSON.parse(rawBody);
    expect(body).toMatchObject({
      secret: 'secret-key-real',
      response: 'valid-cf-token',
      remoteip: '198.51.100.7',
    });
    expect(typeof body.idempotency_key).toBe('string');
  });

  it('accepts Cloudflare official dummy secret response with blank action and example.com hostname', async () => {
    const svc = makeService({
      siteKey: '1x00000000000000000000AA',
      secretKey: '1x0000000000000000000000000000000AA',
    });
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: '',
          hostname: 'example.com',
          'error-codes': [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      svc.verifyToken({ token: 'XXXX.DUMMY.TOKEN.XXXX', expectedAction: 'login', clientIp: null }),
    ).resolves.toBeUndefined();
  });

  it('throws 403 CAPTCHA_VERIFICATION_FAILED when action mismatches (token swap defense)', async () => {
    const svc = makeService();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: 'login',
          hostname: 'devplay.dolynation.app',
          'error-codes': [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    try {
      await svc.verifyToken({
        token: 'token-from-login',
        expectedAction: 'billing_checkout',
        clientIp: '198.51.100.7',
      });
      fail('expected AppHttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(AppHttpException);
      expect((err as AppHttpException).getStatus()).toBe(403);
      expect((err as AppHttpException).getResponse()).toMatchObject({
        code: ErrorCode.CAPTCHA_VERIFICATION_FAILED,
      });
    }

    expect(auditLogsMock.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'security.captcha_rejected',
        metadata: expect.objectContaining({
          expectedAction: 'billing_checkout',
          returnedAction: 'login',
          reason: 'action_mismatch',
        }),
      }),
    );
  });

  it('throws 403 CAPTCHA_VERIFICATION_FAILED when hostname is not allowed', async () => {
    const svc = makeService();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: 'register',
          hostname: 'evil-phishing.example',
          'error-codes': [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    try {
      await svc.verifyToken({
        token: 'foreign-token',
        expectedAction: 'register',
        clientIp: null,
      });
      fail('expected AppHttpException');
    } catch (err) {
      expect((err as AppHttpException).getResponse()).toMatchObject({
        code: ErrorCode.CAPTCHA_VERIFICATION_FAILED,
      });
    }

    expect(auditLogsMock.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: 'hostname_mismatch',
          hostname: 'evil-phishing.example',
        }),
      }),
    );
  });

  it('throws 403 CAPTCHA_VERIFICATION_FAILED when Cloudflare returns success=false', async () => {
    const svc = makeService();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['timeout-or-duplicate'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      svc.verifyToken({ token: 'reused-token', expectedAction: 'login', clientIp: null }),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.CAPTCHA_VERIFICATION_FAILED },
    });
  });

  it('throws 503 CAPTCHA_PROVIDER_UNAVAILABLE when network fails and failOpen=false', async () => {
    const svc = makeService({ failOpen: false });
    fetchSpy.mockRejectedValueOnce(new Error('network timeout'));

    try {
      await svc.verifyToken({ token: 'some-token', expectedAction: 'login', clientIp: null });
      fail('expected AppHttpException');
    } catch (err) {
      expect((err as AppHttpException).getStatus()).toBe(503);
      expect((err as AppHttpException).getResponse()).toMatchObject({
        code: ErrorCode.CAPTCHA_PROVIDER_UNAVAILABLE,
      });
    }
  });

  it('allows request when network fails and failOpen=true', async () => {
    const svc = makeService({ failOpen: true });
    fetchSpy.mockRejectedValueOnce(new Error('network timeout'));

    await expect(
      svc.verifyToken({ token: 'some-token', expectedAction: 'login', clientIp: null }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
