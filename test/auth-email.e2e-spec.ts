// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../src/database/database.tokens';
import type { DrizzleDb } from '../src/database/database.module';
import { authEmailTokens, users } from '../src/database/drizzle/schema';
import { MailService } from '../src/modules/mail/mail.service';

/**
 * Doble del servicio de correo.
 *
 * Sustituye al cliente SMTP para que el e2e **no necesite servidor de correo ni
 * secrets SMTP** (el CI no los tiene). Guarda los tokens enviados para poder
 * consumirlos desde el test.
 */
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

  /** Último token enviado del tipo indicado, o `null` si no se envió ninguno. */
  lastToken(type: 'confirmation' | 'reset'): string | null {
    const matching = this.sent.filter((entry) => entry.type === type);
    return matching.length > 0 ? (matching[matching.length - 1]?.token ?? null) : null;
  }
}

describe('Account email flows (e2e)', () => {
  let app: INestApplication;
  let mail: FakeMailService;
  let db: DrizzleDb;

  const baseUrl = '/api/v1/auth';
  const uniqueEmail = (): string =>
    `auth-email-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = 'api/v1';
    process.env.JWT_ACCESS_TTL = '5m';
    process.env.JWT_REFRESH_TTL = '30d';
    process.env.LOG_LEVEL = 'silent';
    process.env.EMAIL_VERIFICATION_REQUIRED = 'false';

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
    await app.close();
  });

  it('registers a user, confirms the email and rejects the reused token', async () => {
    const email = uniqueEmail();
    const password = 'secure-pass-123';

    const registration = await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password, fullName: 'Email E2E User' })
      .expect(201);
    expect(registration.body.data.emailVerificationRequired).toBe(false);
    expect(registration.body.data.tokens.accessToken).toBeTruthy();

    // El correo de confirmación se envió con un token.
    const token = mail.lastToken('confirmation');
    expect(token).toBeTruthy();

    const confirmation = await supertest(app.getHttpServer())
      .post(`${baseUrl}/verify-email`)
      .send({ token })
      .expect(200);
    expect(confirmation.body.data.emailVerified).toBe(true);
    expect(confirmation.body.data.tokens.accessToken).toBeTruthy();
    expect(confirmation.body.data.tokens.refreshToken).toBeTruthy();
    expect(confirmation.body.data.user.emailVerifiedAt).toBeTruthy();

    // La cuenta queda marcada como verificada en la base de datos.
    const [stored] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    expect(stored?.emailVerifiedAt).not.toBeNull();

    // El token es de un solo uso: reutilizarlo falla.
    const replay = await supertest(app.getHttpServer())
      .post(`${baseUrl}/verify-email`)
      .send({ token })
      .expect(400);
    expect(replay.body.error.code).toBe('AUTH_EMAIL_TOKEN_INVALID');
  });

  it('writes the email locale of the account so the email uses that language', async () => {
    const email = uniqueEmail();

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password: 'secure-pass-123', fullName: 'English User', locale: 'en' })
      .expect(201);

    const [stored] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    expect(stored?.locale).toBe('en');

    const lastMail = mail.sent[mail.sent.length - 1];
    expect(lastMail?.locale).toBe('en');
  });

  it('rejects an unknown, invalid or expired confirmation token', async () => {
    const unknown = await supertest(app.getHttpServer())
      .post(`${baseUrl}/verify-email`)
      .send({ token: 'token-que-no-existe' })
      .expect(400);
    expect(unknown.body.error.code).toBe('AUTH_EMAIL_TOKEN_INVALID');

    // Token expirado: se inserta directamente en la base de datos.
    const email = uniqueEmail();
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password: 'secure-pass-123', fullName: 'Expired User' })
      .expect(201);

    const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const expiredToken = `token-expirado-${Date.now()}`;
    await db.insert(authEmailTokens).values({
      userId: created?.id ?? 0,
      type: 'email_verification',
      tokenHash: createHash('sha256').update(expiredToken).digest('hex'),
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
    });

    const expired = await supertest(app.getHttpServer())
      .post(`${baseUrl}/verify-email`)
      .send({ token: expiredToken })
      .expect(400);
    expect(expired.body.error.code).toBe('AUTH_EMAIL_TOKEN_INVALID');
  });

  it('answers forgot-password the same way for unknown accounts and sends nothing', async () => {
    const before = mail.sent.length;

    const response = await supertest(app.getHttpServer())
      .post(`${baseUrl}/forgot-password`)
      .send({ email: 'nadie-aqui@example.com' })
      .expect(200);

    expect(response.body.data.emailSent).toBe(true);
    expect(mail.sent.length).toBe(before);
  });

  it('resets the password with the emailed token and revokes the old sessions', async () => {
    const email = uniqueEmail();
    const oldPassword = 'secure-pass-123';
    const newPassword = 'another-pass-456';

    const registration = await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password: oldPassword, fullName: 'Reset E2E User' })
      .expect(201);
    const refreshToken = registration.body.data.tokens.refreshToken as string;

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/forgot-password`)
      .send({ email })
      .expect(200);

    const token = mail.lastToken('reset');
    expect(token).toBeTruthy();

    const reset = await supertest(app.getHttpServer())
      .post(`${baseUrl}/reset-password`)
      .send({ token, password: newPassword })
      .expect(200);
    expect(reset.body.data.passwordUpdated).toBe(true);

    // La contraseña antigua ya no sirve y la nueva sí.
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/login`)
      .send({ email, password: oldPassword })
      .expect(401);

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/login`)
      .send({ email, password: newPassword })
      .expect(200);

    // El cambio de contraseña revoca las sesiones activas.
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects an invalid password reset token', async () => {
    const response = await supertest(app.getHttpServer())
      .post(`${baseUrl}/reset-password`)
      .send({ token: 'token-invalido', password: 'otra-clave-789' })
      .expect(400);

    expect(response.body.error.code).toBe('AUTH_EMAIL_TOKEN_INVALID');
  });

  it('rejects a weak password in the reset flow', async () => {
    const response = await supertest(app.getHttpServer())
      .post(`${baseUrl}/reset-password`)
      .send({ token: 'token-invalido', password: 'corta' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
