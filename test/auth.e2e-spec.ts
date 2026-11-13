// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.setTimeout(15_000);

describe('Auth endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = 'api/v1';
    process.env.JWT_ACCESS_TTL = '5m';
    process.env.JWT_REFRESH_TTL = '30d';
    process.env.LOG_LEVEL = 'silent';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  it('validates register, login, refresh rotation, logout, logout-all, and /me against PostgreSQL', async () => {
    const email = `auth-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'secure-pass-123';
    const baseUrl = '/api/v1/auth';

    const invalidRegistration = await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email: 'not-an-email', password: 'short', fullName: '' })
      .expect(400);
    expect(invalidRegistration.body.error.code).toBe('VALIDATION_ERROR');

    const registration = await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password, fullName: 'Auth E2E User' })
      .expect(201);
    const firstTokens = registration.body.data.tokens as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
    expect(firstTokens.expiresIn).toBe(300);
    expect(registration.body.data.user).not.toHaveProperty('password');
    expect(registration.body.data.user).not.toHaveProperty('passwordHash');

    const invalidRefresh = await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({})
      .expect(400);
    expect(invalidRefresh.body.error.code).toBe('VALIDATION_ERROR');

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/register`)
      .send({ email, password, fullName: 'Auth E2E User' })
      .expect(409);

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/login`)
      .send({ email, password: 'incorrect-pass' })
      .expect(401);

    const login = await supertest(app.getHttpServer())
      .post(`${baseUrl}/login`)
      .send({ email, password })
      .expect(200);
    const secondTokens = login.body.data.tokens as {
      accessToken: string;
      refreshToken: string;
    };

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/logout`)
      .set('Authorization', `Bearer ${secondTokens.accessToken}`)
      .send({})
      .expect(400);

    await supertest(app.getHttpServer()).get(`${baseUrl}/me`).expect(401);
    const meBeforePlan = await supertest(app.getHttpServer())
      .get(`${baseUrl}/me`)
      .set('Authorization', `Bearer ${secondTokens.accessToken}`)
      .expect(403);
    expect(meBeforePlan.body.error.code).toBe('SUBSCRIPTION_REQUIRED');

    await supertest(app.getHttpServer())
      .post('/api/v1/user/subscription')
      .set('Authorization', `Bearer ${secondTokens.accessToken}`)
      .send({ tier: 'dolly' })
      .expect(201);

    const me = await supertest(app.getHttpServer())
      .get(`${baseUrl}/me`)
      .set('Authorization', `Bearer ${secondTokens.accessToken}`)
      .expect(200);
    expect(me.body.data.email).toBe(email);
    expect(me.body.data).not.toHaveProperty('password');

    await supertest(app.getHttpServer())
      .get(`${baseUrl}/me`)
      .set('Authorization', `Bearer ${secondTokens.refreshToken}`)
      .expect(401);

    const refreshed = await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken: secondTokens.refreshToken })
      .expect(200);
    const rotatedTokens = refreshed.body.data as {
      accessToken: string;
      refreshToken: string;
    };
    expect(rotatedTokens.refreshToken).not.toBe(secondTokens.refreshToken);
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken: secondTokens.refreshToken })
      .expect(401);

    const logoutRequest = () =>
      supertest(app.getHttpServer())
        .post(`${baseUrl}/logout`)
        .set('Authorization', `Bearer ${rotatedTokens.accessToken}`)
        .send({ refreshToken: rotatedTokens.refreshToken });
    await logoutRequest().expect(200);
    await logoutRequest().expect(200);
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken: rotatedTokens.refreshToken })
      .expect(401);
    await supertest(app.getHttpServer())
      .get(`${baseUrl}/me`)
      .set('Authorization', `Bearer ${rotatedTokens.accessToken}`)
      .expect(200);

    const stillActiveSession = await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken: firstTokens.refreshToken })
      .expect(200);
    const activeTokens = stillActiveSession.body.data as {
      accessToken: string;
      refreshToken: string;
    };

    const anotherLogin = await supertest(app.getHttpServer())
      .post(`${baseUrl}/login`)
      .send({ email, password })
      .expect(200);
    const anotherSessionTokens = anotherLogin.body.data.tokens as {
      refreshToken: string;
    };

    await supertest(app.getHttpServer())
      .post(`${baseUrl}/logout-all`)
      .set('Authorization', `Bearer ${activeTokens.accessToken}`)
      .expect(200);
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken: activeTokens.refreshToken })
      .expect(401);
    await supertest(app.getHttpServer())
      .post(`${baseUrl}/refresh`)
      .send({ refreshToken: anotherSessionTokens.refreshToken })
      .expect(401);
  });
});
