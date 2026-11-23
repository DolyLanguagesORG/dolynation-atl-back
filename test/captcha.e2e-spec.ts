// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { UsersService } from '../src/modules/users/users.service';

jest.setTimeout(20_000);

const TEST_JWT_SECRET = 'a'.repeat(64);
const DUMMY_SITE_KEY = '1x00000000000000000000AA';
const DUMMY_SECRET_KEY = '1x0000000000000000000000000000000AA';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const mockEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '0',
  HOST: '127.0.0.1',
  API_PREFIX: 'api/v1',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_USER: 'test',
  DB_PASSWORD: 'test',
  DB_DATABASE: 'test',
  JWT_SECRET: TEST_JWT_SECRET,
  JWT_ACCESS_TTL: '5m',
  JWT_REFRESH_TTL: '30d',
  AI_DEFAULT_PROVIDER: 'minimax',
  MINIMAX_API_KEY: 'sk-test',
  MINIMAX_MODEL: 'MiniMax-M3',
  MINIMAX_ENDPOINT: 'https://api.test/v1/chat',
  MINIMAX_TIMEOUT_MS: '30000',
  MINIMAX_MAX_TOKENS: '4096',
  MINIMAX_TEMPERATURE: '0.6',
  CAPTCHA_PROVIDER: 'turnstile',
  CAPTCHA_SITE_KEY: DUMMY_SITE_KEY,
  CAPTCHA_SECRET_KEY: DUMMY_SECRET_KEY,
  CAPTCHA_APPEARANCE: 'interaction-only',
  CAPTCHA_ALLOWED_HOSTNAMES: 'devplay.dolynation.app,localhost',
  CAPTCHA_VERIFY_URL: VERIFY_URL,
  CAPTCHA_TIMEOUT_MS: '5000',
  CAPTCHA_FAIL_OPEN: 'false',
  IP_RATE_LIMIT_ENABLED: 'true',
};

function getUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('Cloudflare Turnstile anti-bot protection (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fetchSpy: jest.SpyInstance<Promise<Response>, [RequestInfo | URL, RequestInit?]>;
  let siteverifyCalls = 0;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [key, value] of Object.entries(mockEnv)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }

    const authServiceMock = {
      register: jest.fn().mockResolvedValue({
        user: {
          id: 101,
          email: 'student@dolynation.test',
          fullName: 'Student Test',
          role: 'student',
          subscriptionTier: null,
          currentStreak: 0,
          lastStreakDate: null,
          emailVerifiedAt: '2026-11-22T00:00:00.000Z',
          locale: 'es',
          createdAt: '2026-11-22T00:00:00.000Z',
        },
        tokens: null,
        emailVerificationRequired: true,
      }),
      login: jest.fn().mockResolvedValue({
        user: { id: 101, email: 'student@dolynation.test' },
        tokens: { accessToken: 'acc', refreshToken: 'ref', expiresIn: 300 },
      }),
    };

    const billingServiceMock = {
      createSubscriptionCheckout: jest.fn().mockResolvedValue({
        sessionId: 'cs_test_1',
        clientSecret: 'cs_secret_1',
        url: null,
        publishableKey: 'pk_test_mock',
        uiMode: 'custom',
        tier: 'dolly_plus',
      }),
      handleWebhook: jest.fn().mockResolvedValue({ received: true, ignored: false }),
    };

    const usersServiceMock = {
      findById: jest.fn().mockResolvedValue({
        id: 101,
        email: 'student@dolynation.test',
        fullName: 'Student Test',
        role: 'student',
        emailVerifiedAt: new Date('2026-11-22T00:00:00.000Z'),
      }),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ get: (key: string): string => mockEnv[key] ?? '' })
      .overrideProvider(AuthService)
      .useValue(authServiceMock)
      .overrideProvider(BillingService)
      .useValue(billingServiceMock)
      .overrideProvider(UsersService)
      .useValue(usersServiceMock)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
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
    jwtService = new JwtService({ secret: TEST_JWT_SECRET });
  });

  beforeEach(() => {
    siteverifyCalls = 0;
    const originalFetch = globalThis.fetch.bind(globalThis);
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (getUrl(input) === VERIFY_URL) {
          siteverifyCalls += 1;
          const rawBody = typeof init?.body === 'string' ? init.body : '{}';
          const body = JSON.parse(rawBody) as { response?: string };
          const token = body.response ?? '';

          if (token === 'network-down') {
            throw new Error('ECONNREFUSED');
          }
          if (token === 'wrong-action') {
            return new Response(
              JSON.stringify({
                success: true,
                action: 'login',
                hostname: 'devplay.dolynation.app',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          if (token === 'wrong-host') {
            return new Response(
              JSON.stringify({
                success: true,
                action: 'register',
                hostname: 'attacker.example',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          if (token === 'invalid-token') {
            return new Response(
              JSON.stringify({
                success: false,
                'error-codes': ['invalid-input-response'],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              action: '',
              hostname: 'example.com',
              'error-codes': [],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        return originalFetch(input, init);
      });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, prev] of Object.entries(savedEnv)) {
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  });

  it('GET /api/v1/security/captcha/config exposes public Turnstile config without secretKey', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/security/captcha/config')
      .expect(200);

    expect(res.body.data).toEqual({
      enabled: true,
      provider: 'turnstile',
      siteKey: DUMMY_SITE_KEY,
      appearance: 'interaction-only',
    });
    expect(res.body.data).not.toHaveProperty('secretKey');
  });

  it('rejects POST /auth/register without X-Captcha-Token (400 CAPTCHA_REQUIRED)', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('CF-Connecting-IP', '203.0.113.10')
      .send({
        email: 'bot@example.com',
        password: 'Password123!',
        fullName: 'Bot User',
      })
      .expect(400);

    expect(res.body.error.code).toBe('CAPTCHA_REQUIRED');
    expect(siteverifyCalls).toBe(0);
  });

  it('rejects invalid token, action mismatch, and hostname mismatch with 403 CAPTCHA_VERIFICATION_FAILED', async () => {
    for (const badToken of ['invalid-token', 'wrong-action', 'wrong-host']) {
      const res = await supertest(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('CF-Connecting-IP', '203.0.113.20')
        .set('X-Captcha-Token', badToken)
        .send({
          email: 'user@example.com',
          password: 'Password123!',
          fullName: 'Real User',
        })
        .expect(403);

      expect(res.body.error.code).toBe('CAPTCHA_VERIFICATION_FAILED');
    }
  });

  it('returns 503 CAPTCHA_PROVIDER_UNAVAILABLE when Cloudflare siteverify is unreachable (fail-closed)', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('CF-Connecting-IP', '203.0.113.30')
      .set('X-Captcha-Token', 'network-down')
      .send({
        email: 'user@example.com',
        password: 'Password123!',
        fullName: 'Real User',
      })
      .expect(503);

    expect(res.body.error.code).toBe('CAPTCHA_PROVIDER_UNAVAILABLE');
  });

  it('allows POST /auth/register when Turnstile token passes', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('CF-Connecting-IP', '203.0.113.40')
      .set('X-Captcha-Token', 'valid-turnstile-token')
      .send({
        email: 'human@example.com',
        password: 'Password123!',
        fullName: 'Human User',
      })
      .expect(201);

    expect(res.body.data.user.email).toBe('student@dolynation.test');
    expect(siteverifyCalls).toBe(1);
  });

  it('returns 401 BEFORE calling Turnstile siteverify when an authenticated route lacks a valid JWT', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/billing/checkout/subscription')
      .set('X-Captcha-Token', 'single-use-token-must-not-be-spent')
      .send({ tier: 'dolly_plus' })
      .expect(401);

    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(siteverifyCalls).toBe(0);
  });

  it('validates Turnstile on authenticated Stripe checkout routes once JWT is valid', async () => {
    const token = jwtService.sign({
      sub: 101,
      email: 'student@dolynation.test',
      type: 'access',
    });

    await supertest(app.getHttpServer())
      .post('/api/v1/billing/checkout/subscription')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'dolly_plus' })
      .expect(400);

    const okRes = await supertest(app.getHttpServer())
      .post('/api/v1/billing/checkout/subscription')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Captcha-Token', 'valid-billing-token')
      .send({ tier: 'dolly_plus' })
      .expect(201);

    expect(okRes.body.data.sessionId).toBe('cs_test_1');
    expect(siteverifyCalls).toBe(1);
  });

  it('never requires Turnstile on POST /api/v1/billing/webhook', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/billing/webhook')
      .set('stripe-signature', 't=1,v1=sig')
      .send({ id: 'evt_1' })
      .expect(200);

    expect(res.body.data.received).toBe(true);
    expect(siteverifyCalls).toBe(0);
  });
});
