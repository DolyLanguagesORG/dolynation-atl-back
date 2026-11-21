// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createSign, generateKeyPairSync, type KeyObject, type webcrypto } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '../src/database/database.module';
import { DRIZZLE } from '../src/database/database.tokens';
import { auditLogs, roles, userOAuthAccounts, users } from '../src/database/drizzle/schema';
import { MailService } from '../src/modules/mail/mail.service';

jest.setTimeout(30_000);

const TEST_CLIENT_ID = 'e2e-google-client-id.apps.googleusercontent.com';
const TEST_CLIENT_SECRET = 'e2e-google-test-secret-not-real';
const TEST_REDIRECT_URI = 'http://localhost:3000/api/auth/oauth/google/callback';
const TEST_KEY_ID = 'e2e-google-key-1';

type OAuthMockResponse =
  | {
      kind: 'ok';
      sub: string;
      email: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
      family_name?: string;
    }
  | {
      kind: 'oauth_error';
      status: number;
      error: string;
    };

class FakeMailService {
  readonly sent: { type: 'confirmation' | 'reset'; to: string; token: string; locale: string }[] =
    [];

  sendAccountConfirmation(input: {
    to: string;
    fullName: string | null;
    token: string;
    locale: string;
  }): Promise<void> {
    this.sent.push({
      type: 'confirmation',
      to: input.to,
      token: input.token,
      locale: input.locale,
    });
    return Promise.resolve();
  }

  sendPasswordReset(input: {
    to: string;
    fullName: string | null;
    token: string;
    locale: string;
  }): Promise<void> {
    this.sent.push({ type: 'reset', to: input.to, token: input.token, locale: input.locale });
    return Promise.resolve();
  }

  lastToken(type: 'confirmation' | 'reset', to?: string): string | null {
    const matching = this.sent.filter((entry) => entry.type === type && (!to || entry.to === to));
    return matching.length > 0 ? (matching[matching.length - 1]?.token ?? null) : null;
  }
}

function signMockIdToken(params: {
  privateKey: KeyObject;
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: TEST_KEY_ID }),
    'utf8',
  ).toString('base64url');
  const payload: Record<string, unknown> = {
    iss: 'https://accounts.google.com',
    aud: TEST_CLIENT_ID,
    azp: TEST_CLIENT_ID,
    sub: params.sub,
    email: params.email,
    email_verified: params.emailVerified ?? true,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  if (params.name !== undefined) payload['name'] = params.name;
  if (params.givenName !== undefined) payload['given_name'] = params.givenName;
  if (params.familyName !== undefined) payload['family_name'] = params.familyName;

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signatureB64 = signer.sign(params.privateKey).toString('base64url');
  return `${signingInput}.${signatureB64}`;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('Google OAuth 2.0 / OIDC flows against PostgreSQL (e2e)', () => {
  let app: INestApplication;
  let db: DrizzleDb;
  let mail: FakeMailService;
  let fetchSpy: jest.SpyInstance<Promise<Response>, [RequestInfo | URL, RequestInit?]> | undefined;

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk: webcrypto.JsonWebKey & { kid: string; use: string; alg: string } = {
    ...publicKey.export({ format: 'jwk' }),
    kid: TEST_KEY_ID,
    use: 'sig',
    alg: 'RS256',
  };

  const mockByCode = new Map<string, OAuthMockResponse>();
  const savedEnv: Record<string, string | undefined> = {};

  const envOverrides: Record<string, string> = {
    NODE_ENV: 'test',
    API_PREFIX: 'api/v1',
    JWT_ACCESS_TTL: '5m',
    JWT_REFRESH_TTL: '30d',
    LOG_LEVEL: 'silent',
    EMAIL_VERIFICATION_REQUIRED: 'false',
    ACCESS_REQUESTS_ENABLED: 'false',
    BILLING_PROVIDER: 'manual',
    GOOGLE_OAUTH_CLIENT_ID: TEST_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: TEST_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: TEST_REDIRECT_URI,
  };

  const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(envOverrides)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }

    const originalFetch = globalThis.fetch.bind(globalThis);
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getRequestUrl(input);

        if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
          return new Response(JSON.stringify({ keys: [publicJwk] }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'public, max-age=300',
            },
          });
        }

        if (url === 'https://oauth2.googleapis.com/token') {
          const rawBody =
            typeof init?.body === 'string'
              ? init.body
              : init?.body instanceof URLSearchParams
                ? init.body.toString()
                : '';
          const form = new URLSearchParams(rawBody);
          const code = form.get('code') ?? '';
          const mock = mockByCode.get(code);

          if (!mock) {
            return new Response(JSON.stringify({ error: 'invalid_grant' }), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            });
          }

          if (mock.kind === 'oauth_error') {
            return new Response(JSON.stringify({ error: mock.error }), {
              status: mock.status,
              headers: { 'content-type': 'application/json' },
            });
          }

          const idToken = signMockIdToken({
            privateKey,
            sub: mock.sub,
            email: mock.email,
            emailVerified: mock.email_verified,
            name: mock.name,
            givenName: mock.given_name,
            familyName: mock.family_name,
          });

          return new Response(
            JSON.stringify({
              access_token: 'mock-google-access-token',
              token_type: 'Bearer',
              expires_in: 3600,
              id_token: idToken,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return originalFetch(input, init);
      });

    const { AppModule } = await import('../src/app.module');
    mail = new FakeMailService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mail)
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
    db = moduleRef.get(DRIZZLE);
  });

  afterAll(async () => {
    fetchSpy?.mockRestore();
    await app.close();
    for (const [key, prev] of Object.entries(savedEnv)) {
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  });

  it('lists configured OAuth providers without leaking clientSecret', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/auth/oauth/providers')
      .expect(200);

    expect(res.body.message).toBe('Available OAuth providers');
    expect(res.body.data.providers).toEqual([
      {
        provider: 'google',
        enabled: true,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: TEST_CLIENT_ID,
        redirectUri: TEST_REDIRECT_URI,
        scopes: ['openid', 'email', 'profile'],
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(TEST_CLIENT_SECRET);
  });

  it('creates an OAuth-only student, blocks password login until password reset, and logs in on returning exchange', async () => {
    const suffix = uniqueSuffix();
    const email = `oauth-student-${suffix}@example.com`;
    const newEmail = `oauth-student-renamed-${suffix}@example.com`;
    const sub = `google-sub-${suffix}`;
    const code1 = `code-new-${suffix}`;
    const code2 = `code-return-${suffix}`;
    const codeVerifier = 'v'.repeat(43);

    mockByCode.set(code1, {
      kind: 'ok',
      sub,
      email,
      email_verified: true,
      name: 'Elena OAuth',
    });

    const firstExchange = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: code1,
        codeVerifier,
        redirectUri: TEST_REDIRECT_URI,
        locale: 'en',
      })
      .expect(200);

    expect(firstExchange.body.data.provider).toBe('google');
    expect(firstExchange.body.data.isNewUser).toBe(true);
    expect(firstExchange.body.data.linkedExistingAccount).toBe(false);
    expect(firstExchange.body.data.user.email).toBe(email);
    expect(firstExchange.body.data.user.fullName).toBe('Elena OAuth');
    expect(firstExchange.body.data.user.role).toBe('student');
    expect(firstExchange.body.data.user.locale).toBe('en');
    expect(firstExchange.body.data.user.emailVerifiedAt).toBeTruthy();
    expect(firstExchange.body.data.tokens.accessToken).toBeTruthy();
    expect(firstExchange.body.data.tokens.refreshToken).toBeTruthy();

    const userId = firstExchange.body.data.user.id as number;
    const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(dbUser.password).toBeNull();
    expect(dbUser.emailVerifiedAt).not.toBeNull();

    const [dbLink] = await db
      .select()
      .from(userOAuthAccounts)
      .where(
        and(eq(userOAuthAccounts.provider, 'google'), eq(userOAuthAccounts.providerUserId, sub)),
      )
      .limit(1);
    expect(dbLink.userId).toBe(userId);
    expect(dbLink.providerEmail).toBe(email);

    // Password login fails cleanly for OAuth-only account
    const failedLogin = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'any-password-123' })
      .expect(401);
    expect(failedLogin.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    // User can set a password later via forgot-password + reset-password
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email })
      .expect(200);
    const resetToken = mail.lastToken('reset', email);
    expect(resetToken).toBeTruthy();

    const newPassword = 'AddedPassword123!';
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, password: newPassword })
      .expect(200);

    await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    // Returning Google OAuth exchange with same sub does not duplicate user and updates providerEmail
    mockByCode.set(code2, {
      kind: 'ok',
      sub,
      email: newEmail,
      email_verified: true,
      name: 'Elena OAuth',
    });

    const returningExchange = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: code2,
        codeVerifier,
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(200);

    expect(returningExchange.body.data.user.id).toBe(userId);
    expect(returningExchange.body.data.isNewUser).toBe(false);
    expect(returningExchange.body.data.linkedExistingAccount).toBe(false);

    const [updatedLink] = await db
      .select()
      .from(userOAuthAccounts)
      .where(eq(userOAuthAccounts.id, dbLink.id))
      .limit(1);
    expect(updatedLink.providerEmail).toBe(newEmail);
  });

  it('auto-links an existing unverified student by case-insensitive email and verifies emailVerifiedAt', async () => {
    const suffix = uniqueSuffix();
    const email = `oauth-link-${suffix}@example.com`;
    const sub = `google-link-sub-${suffix}`;
    const code = `code-link-${suffix}`;

    const reg = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'ExistingPassword123!', fullName: 'Existing Student' })
      .expect(201);
    const existingId = reg.body.data.user.id as number;
    expect(reg.body.data.user.emailVerifiedAt).toBeNull();

    mockByCode.set(code, {
      kind: 'ok',
      sub,
      email: email.toUpperCase(),
      email_verified: true,
      name: 'Existing Student',
    });

    const linked = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code,
        codeVerifier: 'v'.repeat(43),
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(200);

    expect(linked.body.data.user.id).toBe(existingId);
    expect(linked.body.data.isNewUser).toBe(false);
    expect(linked.body.data.linkedExistingAccount).toBe(true);
    expect(linked.body.data.user.emailVerifiedAt).toBeTruthy();

    const [storedUser] = await db.select().from(users).where(eq(users.id, existingId)).limit(1);
    expect(storedUser.emailVerifiedAt).not.toBeNull();

    const links = await db
      .select()
      .from(userOAuthAccounts)
      .where(eq(userOAuthAccounts.userId, existingId));
    expect(links).toHaveLength(1);
    expect(links[0]?.providerUserId).toBe(sub);
  });

  it('blocks Google OAuth for administrator accounts on both email-match and pre-linked users', async () => {
    const suffix = uniqueSuffix();
    const adminRoles = await db.select().from(roles).where(eq(roles.name, 'admin')).limit(1);
    const adminRole = adminRoles[0];
    expect(adminRole).toBeDefined();

    // Case A: email matches an existing admin account -> 403 + no link created + audit log written
    const adminEmail = `oauth-admin-${suffix}@example.com`;
    const adminReg = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'AdminPassword123!', fullName: 'Platform Admin' })
      .expect(201);
    const adminId = adminReg.body.data.user.id as number;
    await db.update(users).set({ roleId: adminRole.id }).where(eq(users.id, adminId));

    const adminCode = `code-admin-${suffix}`;
    mockByCode.set(adminCode, {
      kind: 'ok',
      sub: `google-admin-sub-${suffix}`,
      email: adminEmail,
      email_verified: true,
      name: 'Platform Admin',
    });

    const blockedEmailMatch = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: adminCode,
        codeVerifier: 'v'.repeat(43),
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(403);
    expect(blockedEmailMatch.body.error.code).toBe('AUTH_OAUTH_ADMIN_FORBIDDEN');

    const adminLinks = await db
      .select()
      .from(userOAuthAccounts)
      .where(eq(userOAuthAccounts.userId, adminId));
    expect(adminLinks).toHaveLength(0);

    const blockedAudits = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.targetUserId, adminId), eq(auditLogs.event, 'auth.oauth_admin_blocked')),
      );
    expect(blockedAudits.length).toBeGreaterThanOrEqual(1);

    // Case B: user signed up with OAuth first, then promoted to admin -> subsequent OAuth login is blocked
    const promotedEmail = `oauth-promoted-${suffix}@example.com`;
    const promotedSub = `google-promoted-sub-${suffix}`;
    const promoCode1 = `code-promo-1-${suffix}`;
    const promoCode2 = `code-promo-2-${suffix}`;

    mockByCode.set(promoCode1, {
      kind: 'ok',
      sub: promotedSub,
      email: promotedEmail,
      email_verified: true,
    });
    const initialStudent = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: promoCode1,
        codeVerifier: 'v'.repeat(43),
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(200);
    const promotedId = initialStudent.body.data.user.id as number;

    await db.update(users).set({ roleId: adminRole.id }).where(eq(users.id, promotedId));

    mockByCode.set(promoCode2, {
      kind: 'ok',
      sub: promotedSub,
      email: promotedEmail,
      email_verified: true,
    });
    const blockedPromoted = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: promoCode2,
        codeVerifier: 'v'.repeat(43),
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(403);
    expect(blockedPromoted.body.error.code).toBe('AUTH_OAUTH_ADMIN_FORBIDDEN');
  });

  it('rejects unverified Google email, invalid codes, unsupported providers, and malformed DTOs', async () => {
    const suffix = uniqueSuffix();
    const unverifiedCode = `code-unverified-${suffix}`;
    mockByCode.set(unverifiedCode, {
      kind: 'ok',
      sub: `google-unverified-sub-${suffix}`,
      email: `unverified-${suffix}@example.com`,
      email_verified: false,
    });

    const unverifiedRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: unverifiedCode,
        codeVerifier: 'v'.repeat(43),
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(403);
    expect(unverifiedRes.body.error.code).toBe('AUTH_OAUTH_EMAIL_UNVERIFIED');

    const invalidGrantRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: 'nonexistent-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(400);
    expect(invalidGrantRes.body.error.code).toBe('AUTH_OAUTH_INVALID_CODE');

    const badRedirectRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: 'any-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'https://evil.example.com/api/auth/oauth/google/callback',
      })
      .expect(400);
    expect(badRedirectRes.body.error.code).toBe('AUTH_OAUTH_INVALID_CODE');

    const unsupportedRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/github/exchange')
      .send({
        code: 'any-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(400);
    expect(unsupportedRes.body.error.code).toBe('AUTH_OAUTH_UNSUPPORTED_PROVIDER');

    const shortVerifierRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: 'any-code',
        codeVerifier: 'too-short',
        redirectUri: TEST_REDIRECT_URI,
      })
      .expect(400);
    expect(shortVerifierRes.body.error.code).toBe('VALIDATION_ERROR');

    const ftpRedirectRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/oauth/google/exchange')
      .send({
        code: 'any-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'ftp://localhost:3000/callback',
      })
      .expect(400);
    expect(ftpRedirectRes.body.error.code).toBe('VALIDATION_ERROR');
  });
});
