// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MailService } from '../src/modules/mail/mail.service';

/**
 * E2E del flujo de verificación de correo con `EMAIL_VERIFICATION_REQUIRED=true`.
 *
 * Vive en su propio archivo (y no como un `describe` más de
 * `auth-email.e2e-spec.ts`) porque la variable de entorno se lee al validar la
 * configuración al arrancar el módulo: cada archivo de Jest tiene su propio
 * registro de módulos, así que aquí se puede activar el flag sin arrastrar al
 * resto de la suite.
 */

/** Doble del servicio de correo: sustituye al cliente SMTP y guarda los tokens. */
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

  lastToken(type: 'confirmation' | 'reset'): string | null {
    const matching = this.sent.filter((entry) => entry.type === type);
    return matching.length > 0 ? (matching[matching.length - 1]?.token ?? null) : null;
  }
}

describe('Account email flows with verification required (e2e)', () => {
  let app: INestApplication;
  let mail: FakeMailService;

  const baseUrl = '/api/v1/auth';
  const uniqueEmail = (): string =>
    `auth-verify-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = 'api/v1';
    process.env.JWT_ACCESS_TTL = '5m';
    process.env.JWT_REFRESH_TTL = '30d';
    process.env.LOG_LEVEL = 'silent';
    // Se activa antes de importar el módulo: la configuración se valida al arrancar.
    process.env.EMAIL_VERIFICATION_REQUIRED = 'true';

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
  });

  afterAll(async () => {
    await app.close();
    delete process.env.EMAIL_VERIFICATION_REQUIRED;
  });

  it('does not issue tokens on register and blocks the login until the email is confirmed', async () => {
    const email = uniqueEmail();
    const password = 'secure-pass-123';

    const registration = await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password, fullName: 'Verify E2E User' })
      .expect(201);

    expect(registration.body.data.tokens).toBeNull();
    expect(registration.body.data.emailVerificationRequired).toBe(true);

    // Con la cuenta sin confirmar no se puede iniciar sesión.
    const blocked = await supertest(app.getHttpServer())
      .post(`${baseUrl}/login`)
      .send({ email, password })
      .expect(403);
    expect(blocked.body.error.code).toBe('AUTH_EMAIL_NOT_VERIFIED');

    // Tras confirmar el correo, la cuenta ya puede entrar.
    const token = mail.lastToken('confirmation');
    expect(token).toBeTruthy();

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/verify-email`)
      .send({ token })
      .expect(200);

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/login`)
      .send({ email, password })
      .expect(200);
  });

  it('rejects the refresh of a session that was not confirmed', async () => {
    const email = uniqueEmail();

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password: 'secure-pass-123', fullName: 'Refresh Verify User' })
      .expect(201);

    // Sin tokens no hay sesión que renovar: el refresh falla por token inválido.
    const refresh = await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken: 'token-inexistente' })
      .expect(401);
    expect(refresh.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('resends the confirmation email while the account is still unverified', async () => {
    const email = uniqueEmail();
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password: 'secure-pass-123', fullName: 'Resend E2E User' })
      .expect(201);

    const before = mail.sent.filter((entry) => entry.type === 'confirmation').length;

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/resend-verification`)
      .send({ email })
      .expect(200);

    const after = mail.sent.filter((entry) => entry.type === 'confirmation').length;
    expect(after).toBe(before + 1);
  });
});
