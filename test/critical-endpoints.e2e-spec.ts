// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../src/database/database.tokens';
import type { DrizzleDb } from '../src/database/database.module';
import { promptLogs, roles, users } from '../src/database/drizzle/schema';
import { AIProviderFactory } from '../src/modules/ia/providers/ai-provider.factory';
import type { ChatMessage } from '../src/modules/ia/providers/ai-provider.interface';
import { GoogleDecisionsService } from '../src/modules/ia/decisions/google-decisions.service';
import { MailService } from '../src/modules/mail/mail.service';

jest.setTimeout(30_000);

interface EnvelopeBody {
  message?: unknown;
  data?: unknown;
  error?: unknown;
}

function assertCleanEnvelope(body: unknown): void {
  expect(body).toBeDefined();
  expect(typeof body).toBe('object');
  const envelope = body as EnvelopeBody;
  expect(typeof envelope.message).toBe('string');
  expect('data' in envelope).toBe(true);
  if ('error' in envelope && envelope.error !== undefined) {
    expect(envelope.data).toBeNull();
    expect(typeof envelope.error).toBe('object');
  }
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/node_modules\//i);
  expect(serialized).not.toMatch(/\bat\s+[A-Za-z0-9_$.]+\s+\(/);
  expect(serialized).not.toHaveProperty('stack');
}

function extractCategoryFromPrompt(userPrompt: string): string {
  const outputMatch = /JSON "category" MUST be "([^"]+)"/.exec(userPrompt);
  if (outputMatch?.[1]) {
    return outputMatch[1].trim();
  }
  const taggedMatch = /<topic_category>\s*([\s\S]*?)\s*<\/topic_category>/.exec(userPrompt);
  if (taggedMatch?.[1]) {
    return taggedMatch[1].trim();
  }
  return 'technology';
}

describe('Critical endpoints full contract & DB suite (#71) (e2e)', () => {
  let app: INestApplication;
  let db: DrizzleDb;
  const createdUserIds: number[] = [];

  const server = (): Parameters<typeof supertest>[0] =>
    app.getHttpServer() as Parameters<typeof supertest>[0];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = 'api/v1';
    process.env.JWT_ACCESS_TTL = '5m';
    process.env.JWT_REFRESH_TTL = '30d';
    process.env.LOG_LEVEL = 'silent';
    process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
    process.env.ACCESS_REQUESTS_ENABLED = 'false';
    process.env.BILLING_PROVIDER = 'manual';
    process.env.CAPTCHA_PROVIDER = 'disabled';
    process.env.CAPTCHA_SITE_KEY = '';
    process.env.CAPTCHA_SECRET_KEY = '';
    process.env.IP_RATE_LIMIT_ENABLED = 'false';
    process.env.CATEGORY_MODERATION_ENABLED = 'true';
    process.env.CATEGORY_MODERATION_AI_ENABLED = 'true';
    process.env.CATEGORY_MODERATION_AI_PROVIDER = 'minimax';
    process.env.AI_DEFAULT_PROVIDER = 'minimax';
    process.env.MINIMAX_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = '';
    process.env.PERSPECTIVE_API_KEY = '';

    const aiStub = {
      resolveProviderName: (): 'minimax' => 'minimax',
      getFullResponse: jest.fn((messages: ChatMessage[]): Promise<string> => {
        const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
        const userPrompt = messages.find((m) => m.role === 'user')?.content ?? '';

        if (systemPrompt.includes('You moderate user-requested reading categories')) {
          const list = JSON.parse(userPrompt.replace(/^Categories:\s*/i, '').trim()) as string[];
          return Promise.resolve(
            JSON.stringify({
              results: list.map((category) => ({ category, allowed: true, reason: 'ok' })),
            }),
          );
        }

        if (systemPrompt.includes('"subtopic"') && systemPrompt.includes('"keyConcepts"')) {
          const category = extractCategoryFromPrompt(userPrompt);
          return Promise.resolve(
            JSON.stringify({
              subtopic: `Key concepts in ${category}`,
              perspective: 'analytical synthesis',
              uniqueFocusElement: `terminology precision for ${category}`,
              keyConcepts: ['syntax', 'semantics', 'pragmatics'],
            }),
          );
        }

        if (systemPrompt.includes('"title"') && systemPrompt.includes('"content"')) {
          const category = extractCategoryFromPrompt(userPrompt);
          const difficulty = /MUST be "(easy|medium|hard)"/.exec(userPrompt)?.[1] ?? 'medium';
          return Promise.resolve(
            JSON.stringify({
              title: `Structured Insight into ${category} (${difficulty})`,
              description: 'Expository reading exploring precise domain terminology.',
              content:
                'Analytical reading blends clear syntax with contextual semantics across authentic examples.\n\nPractical pragmatics help learners select appropriate register in written discourse.',
              category,
              difficulty,
            }),
          );
        }

        if (systemPrompt.includes('comprehension evaluator')) {
          return Promise.resolve(
            JSON.stringify({
              coverage: 92,
              accuracy: 90,
              coherence: 88,
              feedback:
                'Clear and accurate synthesis highlighting syntax, semantics, and pragmatics.',
            }),
          );
        }

        return Promise.resolve(
          JSON.stringify({
            literalMeaning: 'The branch of linguistics dealing with language in real use.',
            explanation:
              'Here pragmatics highlights how speakers adapt phrasing to social register and situation.',
            wordBreakdown: [],
            otherWaysToSay: [],
            otherContexts: [],
          }),
        );
      }),
    };

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AIProviderFactory)
      .useValue(aiStub)
      .overrideProvider(GoogleDecisionsService)
      .useValue({ isConfigured: () => false })
      .overrideProvider(MailService)
      .useValue({
        sendAccountConfirmation: () => Promise.resolve(),
        sendPasswordReset: () => Promise.resolve(),
      })
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
    db = app.get<DrizzleDb>(DRIZZLE);
  });

  afterAll(async () => {
    if (db) {
      if (createdUserIds.length > 0) {
        await db.delete(promptLogs).where(inArray(promptLogs.userId, createdUserIds));
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    }
    await app.close();
  });

  it('validates health, Argon2id storage, auth lifecycle, profile, readings, vocab, history, streak, and admin RBAC', async () => {
    // 1. Health probes
    const liveRes = await supertest(server()).get('/api/v1/health/live').expect(200);
    assertCleanEnvelope(liveRes.body);
    const readyRes = await supertest(server()).get('/api/v1/health/ready').expect(200);
    assertCleanEnvelope(readyRes.body);
    expect(readyRes.body.data).toMatchObject({
      status: 'ok',
      info: { db: { status: 'up' } },
    });

    // 2. Register + verify Argon2id hash in Postgres
    const email = `critical-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'CriticalPassword123!';
    const regRes = await supertest(server())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'Critical E2E Student' })
      .expect(201);
    assertCleanEnvelope(regRes.body);
    const userId = regRes.body.data.user.id as number;
    createdUserIds.push(userId);

    const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(dbUser).toBeDefined();
    expect(dbUser?.password).toMatch(/^\$argon2id\$/);

    // 3. Login, /auth/me auth checks, subscription plan, refresh rotation & logout revocation
    const loginRes = await supertest(server())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    assertCleanEnvelope(loginRes.body);
    const tokens = loginRes.body.data.tokens as { accessToken: string; refreshToken: string };
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');

    const unauthMe = await supertest(server()).get('/api/v1/auth/me').expect(401);
    assertCleanEnvelope(unauthMe.body);
    const badTokenMe = await supertest(server())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .expect(401);
    assertCleanEnvelope(badTokenMe.body);

    await supertest(server())
      .post('/api/v1/user/subscription')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ tier: 'dolly_pro' })
      .expect(201);

    const meRes = await supertest(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    assertCleanEnvelope(meRes.body);
    expect(meRes.body.data).toMatchObject({ id: userId, email });

    const refreshRes = await supertest(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    assertCleanEnvelope(refreshRes.body);
    const rotated = refreshRes.body.data as { accessToken: string; refreshToken: string };

    const logoutRes = await supertest(server())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);
    assertCleanEnvelope(logoutRes.body);

    const reuseAfterLogout = await supertest(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
    assertCleanEnvelope(reuseAfterLogout.body);

    // Re-login after logout
    const activeLogin = await supertest(server())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const auth = `Bearer ${activeLogin.body.data.tokens.accessToken as string}`;

    // 4. Profile GET & PATCH persistence
    const profileRes = await supertest(server())
      .get('/api/v1/user/profile')
      .set('Authorization', auth)
      .expect(200);
    assertCleanEnvelope(profileRes.body);
    expect(profileRes.body.data.email).toBe(email);

    const updatedName = 'Updated Critical Student';
    const patchProfileRes = await supertest(server())
      .patch('/api/v1/user/profile')
      .set('Authorization', auth)
      .send({ fullName: updatedName })
      .expect(200);
    assertCleanEnvelope(patchProfileRes.body);
    expect(patchProfileRes.body.data.fullName).toBe(updatedName);

    const verifyProfileRes = await supertest(server())
      .get('/api/v1/user/profile')
      .set('Authorization', auth)
      .expect(200);
    expect(verifyProfileRes.body.data.fullName).toBe(updatedName);

    // 5. Settings, Readings, GET /readings/:id + cross-user isolation, Vocabulary, Glossary, Evaluate, History & Streak
    await supertest(server())
      .put('/api/v1/settings/languages')
      .set('Authorization', auth)
      .send({ languages: ['en'] })
      .expect(200);

    const categories = ['technology', 'science', 'history'];
    await supertest(server())
      .put('/api/v1/settings/categories')
      .set('Authorization', auth)
      .send({ categories })
      .expect(200);

    const createReadingRes = await supertest(server())
      .post('/api/v1/readings')
      .set('Authorization', auth)
      .send({ category: 'technology', language: 'en', difficulty: 'medium', size: 'short' })
      .expect(201);
    assertCleanEnvelope(createReadingRes.body);
    const reading = createReadingRes.body.data as {
      id: number;
      title: string;
      content: string;
      category: string;
    };

    const getReadingRes = await supertest(server())
      .get(`/api/v1/readings/${reading.id}`)
      .set('Authorization', auth)
      .expect(200);
    assertCleanEnvelope(getReadingRes.body);
    expect(getReadingRes.body.data).toMatchObject({
      id: reading.id,
      title: reading.title,
      content: reading.content,
      category: reading.category,
    });

    const explainRes = await supertest(server())
      .post(`/api/v1/readings/${reading.id}/explanations`)
      .set('Authorization', auth)
      .send({ word: 'pragmatics' })
      .expect(201);
    assertCleanEnvelope(explainRes.body);

    const glossaryRes = await supertest(server())
      .get('/api/v1/readings/glossary')
      .set('Authorization', auth)
      .expect(200);
    assertCleanEnvelope(glossaryRes.body);
    expect(
      (glossaryRes.body.data as Array<{ word: string }>).some(
        (item) => item.word.toLowerCase() === 'pragmatics',
      ),
    ).toBe(true);

    const evalRes = await supertest(server())
      .post(`/api/v1/readings/${reading.id}/evaluate`)
      .set('Authorization', auth)
      .send({
        userResponse:
          'Analytical reading links syntax and semantics with pragmatics so learners choose the right register.',
      })
      .expect(201);
    assertCleanEnvelope(evalRes.body);
    // round(92*0.45 + 90*0.35 + 88*0.20) = round(41.4 + 31.5 + 17.6) = round(90.5) = 91
    expect(evalRes.body.data).toMatchObject({
      score: 91,
      passed: true,
      feedback: expect.any(String),
    });

    const historyRes = await supertest(server())
      .get('/api/v1/history')
      .set('Authorization', auth)
      .expect(200);
    assertCleanEnvelope(historyRes.body);
    expect(historyRes.body.data.readings.completed).toBeGreaterThanOrEqual(1);

    const scoresRes = await supertest(server())
      .get('/api/v1/history/scores')
      .set('Authorization', auth)
      .expect(200);
    assertCleanEnvelope(scoresRes.body);
    expect(
      (scoresRes.body.data as Array<{ readingId: number; score: number }>).some(
        (entry) => entry.readingId === reading.id && entry.score === 91,
      ),
    ).toBe(true);

    const streakRes = await supertest(server())
      .get('/api/v1/user/streak?days=7')
      .set('Authorization', auth)
      .expect(200);
    assertCleanEnvelope(streakRes.body);
    expect(streakRes.body.data.count).toBeGreaterThanOrEqual(1);

    // 6. Admin RBAC: student rejected with 403; promoted admin accesses /admin/categories with 200
    const forbiddenAdmin = await supertest(server())
      .get('/api/v1/admin/categories')
      .set('Authorization', auth)
      .expect(403);
    assertCleanEnvelope(forbiddenAdmin.body);
    expect(forbiddenAdmin.body.error.code).toBe('RESOURCE_FORBIDDEN');

    const adminEmail = `critical-admin-${Date.now()}@example.com`;
    const adminReg = await supertest(server())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password, fullName: 'Critical Admin' })
      .expect(201);
    const adminId = adminReg.body.data.user.id as number;
    createdUserIds.push(adminId);

    const [adminRole] = await db.select().from(roles).where(eq(roles.name, 'admin')).limit(1);
    expect(adminRole).toBeDefined();
    if (!adminRole) {
      throw new Error('Missing seeded admin role');
    }
    await db.update(users).set({ roleId: adminRole.id }).where(eq(users.id, adminId));

    const adminLogin = await supertest(server())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    const adminToken = adminLogin.body.data.tokens.accessToken as string;

    // Student cannot read or mutate readings owned by another user -> 404 isolation
    await supertest(server())
      .get(`/api/v1/readings/${reading.id}`)
      .set('Authorization', auth)
      .expect(200);

    const otherReg = await supertest(server())
      .post('/api/v1/auth/register')
      .send({
        email: `critical-other-${Date.now()}@example.com`,
        password,
        fullName: 'Other User',
      })
      .expect(201);
    createdUserIds.push(otherReg.body.data.user.id as number);
    const otherAuth = `Bearer ${otherReg.body.data.tokens.accessToken as string}`;
    await supertest(server())
      .post('/api/v1/user/subscription')
      .set('Authorization', otherAuth)
      .send({ tier: 'dolly' })
      .expect(201);
    await supertest(server())
      .get(`/api/v1/readings/${reading.id}`)
      .set('Authorization', otherAuth)
      .expect(404);

    const adminCategories = await supertest(server())
      .get('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assertCleanEnvelope(adminCategories.body);
    expect(Array.isArray(adminCategories.body.data)).toBe(true);

    const adminUsers = await supertest(server())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assertCleanEnvelope(adminUsers.body);
    expect(Array.isArray(adminUsers.body.data)).toBe(true);
    expect((adminUsers.body.data as unknown[]).length).toBeGreaterThan(0);
  });
});
