// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { Test as SupertestRequest } from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../src/database/database.tokens';
import type { DrizzleDb } from '../src/database/database.module';
import { readingExplanations, readings, users, userSettings } from '../src/database/drizzle/schema';
import { AIProviderFactory } from '../src/modules/ia/providers/ai-provider.factory';
import type { ChatMessage } from '../src/modules/ia/providers/ai-provider.interface';
import { GoogleDecisionsService } from '../src/modules/ia/decisions/google-decisions.service';
import { MailService } from '../src/modules/mail/mail.service';

jest.setTimeout(60_000);

/** Latencia artificial del proveedor de IA: ensancha la ventana de carrera como en producción. */
const AI_LATENCY_MS = 250;

const READING_PARAGRAPHS = [
  'Understanding complex domains relies on connecting foundational mechanisms with precise, practical terminology in context.',
  'Across modern practice, empirical observation clarifies how distinct variables interact under shifting constraints.',
  'Taken together, structured exposition helps learners retain authentic expressions while grasping systemic trade-offs.',
];

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('Concurrent requests (e2e)', () => {
  let app: INestApplication;
  let db: DrizzleDb;
  const createdUserIds: number[] = [];
  let evaluationCalls = 0;

  const uniqueEmail = (tag: string): string =>
    `qa-race-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const server = (): Parameters<typeof supertest>[0] =>
    app.getHttpServer() as Parameters<typeof supertest>[0];

  const registerUser = async (tag: string): Promise<{ id: number; auth: string }> => {
    const res = await supertest(server())
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(tag), password: 'QaPassword123!', fullName: `QA ${tag}` })
      .expect(201);
    const id = res.body.data.user.id as number;
    createdUserIds.push(id);
    return { id, auth: `Bearer ${res.body.data.tokens.accessToken as string}` };
  };

  const prepareStudent = async (tag: string): Promise<{ id: number; auth: string }> => {
    const student = await registerUser(tag);
    await supertest(server())
      .post('/api/v1/user/subscription')
      .set('Authorization', student.auth)
      .send({ tier: 'dolly' })
      .expect(201);
    await supertest(server())
      .put('/api/v1/settings/languages')
      .set('Authorization', student.auth)
      .send({ languages: ['en'] })
      .expect(200);
    await supertest(server())
      .put('/api/v1/settings/categories')
      .set('Authorization', student.auth)
      .send({ categories: ['technology', 'history', 'ciencia de datos'] })
      .expect(200);
    return student;
  };

  const generateReading = (auth: string): SupertestRequest =>
    supertest(server())
      .post('/api/v1/readings')
      .set('Authorization', auth)
      .send({ category: 'technology', language: 'en', difficulty: 'medium', size: 'short' });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = 'api/v1';
    process.env.JWT_ACCESS_TTL = '5m';
    process.env.JWT_REFRESH_TTL = '30d';
    process.env.LOG_LEVEL = 'silent';
    process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
    process.env.ACCESS_REQUESTS_ENABLED = 'false';
    process.env.BILLING_PROVIDER = 'manual';
    process.env.CATEGORY_MODERATION_ENABLED = 'true';
    process.env.CATEGORY_MODERATION_AI_ENABLED = 'true';
    process.env.CATEGORY_MODERATION_AI_PROVIDER = 'minimax';
    process.env.AI_DEFAULT_PROVIDER = 'minimax';
    process.env.MINIMAX_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = '';
    process.env.PERSPECTIVE_API_KEY = '';

    const aiStub = {
      getFullResponse: jest.fn(async (messages: ChatMessage[]): Promise<string> => {
        const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
        const userPrompt = messages.find((m) => m.role === 'user')?.content ?? '';

        if (systemPrompt.includes('You moderate user-requested reading categories')) {
          const list = JSON.parse(userPrompt.replace(/^Categories:\s*/i, '').trim()) as string[];
          return JSON.stringify({
            results: list.map((category) => ({ category, allowed: true, reason: 'ok' })),
          });
        }

        if (systemPrompt.includes('"subtopic"') && systemPrompt.includes('"keyConcepts"')) {
          return JSON.stringify({
            subtopic: 'Focus on technology',
            perspective: 'process and vocabulary analysis',
            uniqueFocusElement: 'how foundational terminology structures technology',
            keyConcepts: ['concept-1', 'concept-2', 'concept-3'],
          });
        }

        if (systemPrompt.includes('"title"') && systemPrompt.includes('"content"')) {
          await delay(AI_LATENCY_MS);
          const difficulty = /MUST be "(easy|medium|hard)"/.exec(userPrompt)?.[1] ?? 'medium';
          return JSON.stringify({
            title: `Core mechanics and context of technology (${difficulty})`,
            description: 'An expository overview building domain vocabulary through clear prose.',
            content: READING_PARAGRAPHS.join('\n\n'),
            category: 'technology',
            difficulty,
          });
        }

        if (systemPrompt.includes('comprehension evaluator')) {
          await delay(AI_LATENCY_MS);
          evaluationCalls += 1;
          // Cada evaluación devuelve una nota distinta para detectar sobrescrituras.
          const score = evaluationCalls === 1 ? 92 : 41;
          return JSON.stringify({
            score,
            passed: score >= 80,
            feedback: 'You accurately summarized the central mechanism and its implications.',
          });
        }

        if (systemPrompt.includes('vocabulary explainer')) {
          await delay(AI_LATENCY_MS);
          return JSON.stringify({
            literalMeaning: 'A basic idea that supports a larger system of knowledge.',
            explanation:
              'In this reading the term names a building block that learners connect with practical vocabulary.',
            wordBreakdown: [],
            otherWaysToSay: [],
            otherContexts: [],
          });
        }

        return 'Chat mock response';
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
    if (db && createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await app.close();
    delete process.env.BILLING_PROVIDER;
  });

  it('never creates more than 3 pending readings when generations run in parallel', async () => {
    const student = await prepareStudent('pending');

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => generateReading(student.auth)),
    );
    const created = responses.filter((r) => r.status === 201).length;
    const blocked = responses.filter(
      (r) => r.body?.error?.code === 'READING_PENDING_LIMIT_REACHED',
    ).length;

    const pendingRows = await db
      .select({ id: readings.id })
      .from(readings)
      .where(and(eq(readings.userId, student.id), eq(readings.status, 'pending')));

    expect(created).toBe(3);
    expect(blocked).toBe(3);
    expect(pendingRows).toHaveLength(3);
  });

  it('evaluates a reading only once when the summary is submitted twice in parallel', async () => {
    const student = await prepareStudent('evaluate');
    const generated = await generateReading(student.auth).expect(201);
    const readingId = generated.body.data.id as number;
    evaluationCalls = 0;

    const submit = (): SupertestRequest =>
      supertest(server())
        .post(`/api/v1/readings/${readingId}/evaluate`)
        .set('Authorization', student.auth)
        .send({ userResponse: 'The article discusses foundational technology concepts in depth.' });

    const responses = await Promise.all([submit(), submit()]);
    const ok = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.body?.error?.code === 'READING_ALREADY_EVALUATED');

    const [row] = await db
      .select({ score: readings.score, status: readings.status })
      .from(readings)
      .where(eq(readings.id, readingId));

    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(row?.status).toBe('completed');
    expect(row?.score).toBe(ok[0]?.body.data.score);
  });

  it('spends a single language-change credit once under parallel changes', async () => {
    const student = await registerUser('credit');
    await supertest(server())
      .post('/api/v1/user/subscription')
      .set('Authorization', student.auth)
      .send({ tier: 'dolly' })
      .expect(201);
    await supertest(server())
      .put('/api/v1/settings/languages')
      .set('Authorization', student.auth)
      .send({ languages: ['fr'] })
      .expect(200);
    await supertest(server())
      .post('/api/v1/settings/languages/unlock-change')
      .set('Authorization', student.auth)
      .expect(200);

    const responses = await Promise.all(
      ['es', 'it', 'en'].map((lang) =>
        supertest(server())
          .put('/api/v1/settings/languages')
          .set('Authorization', student.auth)
          .send({ languages: [lang] }),
      ),
    );

    const [settings] = await db
      .select({ credits: userSettings.languageChangeCredits })
      .from(userSettings)
      .where(eq(userSettings.userId, student.id));

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.body?.error?.code === 'LANGUAGE_CHANGE_LOCKED')).toHaveLength(
      2,
    );
    expect(settings?.credits).toBe(0);
  });

  it('never exceeds the daily explanation quota when explanations run in parallel', async () => {
    const student = await prepareStudent('explain');
    const generated = await generateReading(student.auth).expect(201);
    const readingId = generated.body.data.id as number;

    // Plan Dolly: 15 explicaciones al día. Se dejan 13 consumidas para que solo quepan 2 más.
    const DAILY_LIMIT = 15;
    const ALREADY_USED = 13;
    await db.insert(readingExplanations).values(
      Array.from({ length: ALREADY_USED }, (_, i) => ({
        readingId,
        userId: student.id,
        word: `seed${i}`,
        normalizedWord: `seed${i}`,
        explanation: 'Seeded explanation used to fill the daily quota.',
      })),
    );

    // Palabras distintas para que ninguna petición se resuelva desde la caché.
    const words = [
      'foundational',
      'mechanisms',
      'terminology',
      'empirical',
      'variables',
      'learners',
    ];
    const responses = await Promise.all(
      words.map((word) =>
        supertest(server())
          .post(`/api/v1/readings/${readingId}/explanations`)
          .set('Authorization', student.auth)
          .send({ word }),
      ),
    );
    const created = responses.filter((r) => r.status === 201).length;
    const blocked = responses.filter(
      (r) => r.body?.error?.code === 'EXPLANATION_DAILY_LIMIT_REACHED',
    ).length;

    const rows = await db
      .select({ id: readingExplanations.id })
      .from(readingExplanations)
      .where(eq(readingExplanations.userId, student.id));

    expect(created).toBe(DAILY_LIMIT - ALREADY_USED);
    expect(blocked).toBe(words.length - (DAILY_LIMIT - ALREADY_USED));
    expect(rows).toHaveLength(DAILY_LIMIT);
  });

  it('answers 409 (not 500) when the same email registers twice in parallel', async () => {
    const email = uniqueEmail('dup');
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        supertest(server())
          .post('/api/v1/auth/register')
          .send({ email, password: 'QaPassword123!', fullName: 'QA dup' }),
      ),
    );
    for (const res of responses) {
      if (res.status === 201) {
        createdUserIds.push(res.body.data.user.id as number);
      }
    }

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      responses.filter((r) => r.body?.error?.code === 'AUTH_EMAIL_ALREADY_EXISTS'),
    ).toHaveLength(4);
  });
});
