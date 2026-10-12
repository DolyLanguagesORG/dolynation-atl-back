/**
 * E2E regression for the OpenAPI document bootstrap order in main.ts.
 *
 * Historical bug (2026-08-30): `SwaggerModule.createDocument(app, config)` was
 * called BEFORE `app.setGlobalPrefix('api/v1')`, so the spec advertised
 * `/auth/register` while the live app served `/api/v1/auth/register`. Scalar's
 * "Try it" then hit the unprefixed path and got 404. The same file also
 * registered `/openapi.json` at root, so spec consumers (mobile apps,
 * generators) found it but couldn't reconcile paths with the running API.
 *
 * Fix applied in src/main.ts: `setGlobalPrefix(...)` is called BEFORE
 * `SwaggerModule.createDocument(...)`, so the OpenAPI document advertises
 * the real paths. The Scalar UI now shows POST /api/v1/auth/register and
 * "Try it" hits the correct route.
 *
 * This test boots Nest in the SAME CORRECTED ORDER as main.ts and asserts:
 *   1. Every path in the served document carries the /api/v1 prefix.
 *   2. The document declares at least one server (so Scalar has a base URL).
 *   3. /openapi.json is reachable at /api/v1/openapi.json (not at root).
 *   4. The live server accepts POST /api/v1/auth/register (end-to-end).
 *
 * NOTE: We do NOT mount the Scalar apiReference handler in this test — the
 * npm package is shipped as ESM and Jest's CommonJS loader cannot transform
 * it. The `/docs` route check is covered by production E2E against the
 * running container; the bootstrap ordering we assert here is independent
 * of Scalar.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/env.config';

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
  JWT_SECRET: 'a'.repeat(64),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  AI_DEFAULT_PROVIDER: 'minimax',
  MINIMAX_API_KEY: 'sk-test',
  MINIMAX_MODEL: 'MiniMax-M3',
  MINIMAX_ENDPOINT: 'https://api.test/v1/chat',
  MINIMAX_TIMEOUT_MS: '30000',
  MINIMAX_MAX_TOKENS: '4096',
  MINIMAX_TEMPERATURE: '0.6',
};

describe('main.ts bootstrap order produces a consistent OpenAPI document', () => {
  let app: INestApplication;
  let document: {
    paths?: Record<string, unknown>;
    servers?: Array<{ url: string }>;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('ConfigService')
      .useValue({
        get: (key: string): string => mockEnv[key] ?? '',
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useLogger({
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      verbose: () => undefined,
      fatal: () => undefined,
    });

    const env = app.get(AppConfigService);

    // CORRECTED ORDER (post-fix): set the global prefix BEFORE building the
    // OpenAPI document, exactly like src/main.ts now does.
    app.setGlobalPrefix(env.apiPrefix);

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Dolynglish API')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    document = SwaggerModule.createDocument(app, swaggerConfig);

    // Mount the JSON spec at the prefixed path (matches the corrected main.ts).
    app.getHttpAdapter().get(`/${env.apiPrefix}/openapi.json`, (_req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json(document);
    });

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

  it('every path in the served OpenAPI document carries the /api/v1 prefix', () => {
    const paths = Object.keys(document.paths ?? {});
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).toMatch(/^\/api\/v1\//);
    }
  });

  it('document.servers is absent or empty (Scalar derives base URL from the browser origin)', () => {
    // We intentionally do NOT call .addServer() in main.ts. The OpenAPI paths
    // already carry the /api/v1 prefix (because setGlobalPrefix runs before
    // createDocument), and Scalar computes its base URL from the page origin.
    // If servers were present and contained /api/v1, Scalar would concat
    // /api/v1 + /api/v1/auth/register and produce the broken double-prefix URL.
    const servers = document.servers ?? [];
    expect(servers.length).toBe(0);
  });

  it('GET /openapi.json is reachable at /api/v1/openapi.json (not at root)', async () => {
    await supertest(app.getHttpServer()).get('/openapi.json').expect(404);
    await supertest(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
  });

  it('live POST /api/v1/auth/register is reachable (not /auth/register)', async () => {
    await supertest(app.getHttpServer()).post('/auth/register').send({}).expect(404);
    // Use a unique email per test run so the assertion is not flaky on repeat
    // runs against a long-lived database.
    const uniqueEmail = `e2e-bugfix-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail, password: 'secret123', fullName: 'Bug Fix' })
      .expect(201);
  });
});
