// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../src/database/database.tokens';
import type { DrizzleDb } from '../src/database/database.module';
import {
  moderatedCategories,
  promptLogs,
  readingExplanations,
  readings,
  users,
} from '../src/database/drizzle/schema';
import { AIProviderFactory } from '../src/modules/ia/providers/ai-provider.factory';
import type { ChatMessage } from '../src/modules/ia/providers/ai-provider.interface';
import { GoogleDecisionsService } from '../src/modules/ia/decisions/google-decisions.service';
import { MailService } from '../src/modules/mail/mail.service';
import { canonicalCategoryKey } from '../src/modules/moderation/category-normalizer';

jest.setTimeout(45_000);

type StubMode =
  'normal' | 'tampered-score' | 'http-500' | 'timeout' | 'rate-limit' | 'invalid-json';

type AiCallKind = 'moderation' | 'enrichment' | 'reading' | 'evaluate' | 'explain' | 'deep';

const READING_PARAGRAPHS = [
  'Modern language acquisition connects analytical observation with domain-specific vocabulary encountered in realistic contexts.',
  'When learners contrast empirical evidence against abstract principles, subtle terminological distinctions become easier to recall.',
  'Coherent reading practice turns isolated expressions into active conceptual tools across everyday discourse.',
];

function extractCategoryFromPrompt(userPrompt: string): string {
  const outputCategoryMatch = /JSON "category" MUST be "([^"]+)"/.exec(userPrompt);
  if (outputCategoryMatch?.[1]) {
    return outputCategoryMatch[1].trim();
  }
  const taggedCategoryMatch = /<topic_category>\s*([\s\S]*?)\s*<\/topic_category>/.exec(userPrompt);
  if (taggedCategoryMatch?.[1]) {
    return taggedCategoryMatch[1].trim();
  }
  return 'technology';
}

function assertNoStackLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/node_modules\//i);
  expect(serialized).not.toMatch(/\bat\s+[A-Za-z0-9_$.]+\s+\(/);
  expect(serialized).not.toHaveProperty('stack');
}

describe('Readings Vocabulary, PNL Evaluation & Degraded Mode (e2e)', () => {
  let app: INestApplication;
  let db: DrizzleDb;
  let stubMode: StubMode = 'normal';
  const callCounts: Record<AiCallKind, number> = {
    moderation: 0,
    enrichment: 0,
    reading: 0,
    evaluate: 0,
    explain: 0,
    deep: 0,
  };
  const createdUserIds: number[] = [];
  const createdCategoryKeys = new Set<string>();

  const server = (): Parameters<typeof supertest>[0] =>
    app.getHttpServer() as Parameters<typeof supertest>[0];

  const uniqueEmail = (tag: string): string =>
    `qa-e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const prepareStudent = async (tag: string): Promise<{ userId: number; auth: string }> => {
    const email = uniqueEmail(tag);
    const password = 'QaPassword123!';
    const reg = await supertest(server())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: `QA ${tag}` })
      .expect(201);
    const userId = reg.body.data.user.id as number;
    createdUserIds.push(userId);
    const auth = `Bearer ${reg.body.data.tokens.accessToken as string}`;

    await supertest(server())
      .post('/api/v1/user/subscription')
      .set('Authorization', auth)
      .send({ tier: 'dolly_pro' })
      .expect(201);

    await supertest(server())
      .put('/api/v1/settings/languages')
      .set('Authorization', auth)
      .send({ languages: ['en', 'es', 'fr', 'it'] })
      .expect(200);

    const categories = ['technology', 'science', 'history'];
    for (const cat of categories) {
      createdCategoryKeys.add(canonicalCategoryKey(cat));
    }
    await supertest(server())
      .put('/api/v1/settings/categories')
      .set('Authorization', auth)
      .send({ categories })
      .expect(200);

    return { userId, auth };
  };

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
          callCounts.moderation += 1;
          const list = JSON.parse(userPrompt.replace(/^Categories:\s*/i, '').trim()) as string[];
          return Promise.resolve(
            JSON.stringify({
              results: list.map((category) => ({ category, allowed: true, reason: 'ok' })),
            }),
          );
        }

        const classifyKind = (): AiCallKind => {
          if (systemPrompt.includes('"subtopic"') && systemPrompt.includes('"keyConcepts"')) {
            return 'enrichment';
          }
          if (systemPrompt.includes('"title"') && systemPrompt.includes('"content"')) {
            return 'reading';
          }
          if (systemPrompt.includes('comprehension evaluator')) {
            return 'evaluate';
          }
          if (systemPrompt.includes('vocabulary explainer')) {
            return 'explain';
          }
          return 'deep';
        };

        const kind = classifyKind();
        callCounts[kind] += 1;

        if (kind !== 'enrichment') {
          if (stubMode === 'http-500') {
            return Promise.reject(
              new Error('MiniMax M3 request failed: 503 Service Unavailable - upstream down'),
            );
          }
          if (stubMode === 'timeout') {
            return Promise.reject(new Error('MiniMax M3 request timed out after 30000ms'));
          }
          if (stubMode === 'rate-limit') {
            return Promise.reject(
              new Error('MiniMax M3 request failed: 429 Too Many Requests - quota exceeded'),
            );
          }
          if (stubMode === 'invalid-json') {
            return Promise.resolve('<<<NOT VALID JSON>>>');
          }
        }

        if (kind === 'enrichment') {
          const category = extractCategoryFromPrompt(userPrompt);
          return Promise.resolve(
            JSON.stringify({
              subtopic: `Applied perspectives in ${category}`,
              perspective: 'empirical observation and terminology',
              uniqueFocusElement: `terminology precision inside ${category}`,
              keyConcepts: ['empirical', 'coherent', 'discourse'],
            }),
          );
        }

        if (kind === 'reading') {
          const category = extractCategoryFromPrompt(userPrompt);
          const difficulty = /MUST be "(easy|medium|hard)"/.exec(userPrompt)?.[1] ?? 'medium';
          return Promise.resolve(
            JSON.stringify({
              title: `Core Principles of ${category} (${difficulty})`,
              description:
                'An expository text exploring analytical observation and domain terminology.',
              content: READING_PARAGRAPHS.join('\n\n'),
              category,
              difficulty,
            }),
          );
        }

        if (kind === 'evaluate') {
          if (stubMode === 'tampered-score') {
            return Promise.resolve(
              JSON.stringify({
                score: 100,
                passed: true,
                coverage: 40,
                accuracy: 50,
                coherence: 50,
                feedback: 'Your summary misses several main arguments from the passage.',
              }),
            );
          }
          return Promise.resolve(
            JSON.stringify({
              coverage: 90,
              accuracy: 86,
              coherence: 88,
              feedback:
                'You captured the link between empirical evidence, vocabulary contrast, and coherent reading.',
            }),
          );
        }

        if (kind === 'explain') {
          return Promise.resolve(
            JSON.stringify({
              literalMeaning: 'Based on direct observation or experience rather than pure theory.',
              explanation:
                'In this passage, empirical highlights evidence grounded in real observation so learners distinguish subtle meanings.',
              wordBreakdown: [
                {
                  token: 'empirical',
                  lemma: 'empirical',
                  partOfSpeech: 'adjective',
                  literalDefinition: 'derived from observation or experiment',
                  roleInPhrase: 'modifies evidence in the argument',
                },
              ],
              otherWaysToSay: [
                {
                  expression: 'observational',
                  register: 'formal',
                  note: 'Useful when emphasizing careful measurement over theory.',
                },
              ],
              otherContexts: [
                {
                  contextLabel: 'scientific research',
                  explanation: 'Describes findings validated by collected data.',
                  example: 'Empirical studies confirmed that spaced recall improves retention.',
                },
              ],
            }),
          );
        }

        return Promise.resolve('Deep coach explanation on nuance and everyday usage.');
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
      if (createdCategoryKeys.size > 0) {
        await db
          .delete(moderatedCategories)
          .where(inArray(moderatedCategories.canonicalKey, Array.from(createdCategoryKeys)));
      }
    }
    await app.close();
  });

  it('covers contextual vocabulary persistence, cache hit idempotency, and 401/400/404 handling (#14)', async () => {
    stubMode = 'normal';
    const student = await prepareStudent('vocab-flow');
    const stranger = await prepareStudent('vocab-stranger');

    const readingRes = await supertest(server())
      .post('/api/v1/readings')
      .set('Authorization', student.auth)
      .send({ category: 'technology', language: 'en', difficulty: 'medium', size: 'short' })
      .expect(201);
    const readingId = readingRes.body.data.id as number;

    const explainBefore = callCounts.explain;
    const explainRes = await supertest(server())
      .post(`/api/v1/readings/${readingId}/explanations`)
      .set('Authorization', student.auth)
      .send({
        word: 'Empirical',
        context: 'When learners contrast empirical evidence against abstract principles.',
      })
      .expect(201);

    expect(callCounts.explain).toBe(explainBefore + 1);
    expect(explainRes.body.data).toMatchObject({
      word: 'Empirical',
      cached: false,
      literalMeaning: expect.any(String),
      explanation: expect.any(String),
    });
    expect(explainRes.body.data.wordBreakdown).toHaveLength(1);
    expect(explainRes.body.data.otherWaysToSay).toHaveLength(1);
    expect(explainRes.body.data.otherContexts).toHaveLength(1);
    const explanationId = explainRes.body.data.id as number;

    const storedRows = await db
      .select()
      .from(readingExplanations)
      .where(
        and(
          eq(readingExplanations.readingId, readingId),
          eq(readingExplanations.normalizedWord, 'empirical'),
        ),
      );
    expect(storedRows).toHaveLength(1);
    expect(storedRows[0]?.id).toBe(explanationId);

    // Repeating the same lookup hits Postgres cache with zero extra AI calls and no duplicate rows.
    const cachedRes = await supertest(server())
      .post(`/api/v1/readings/${readingId}/explanations`)
      .set('Authorization', student.auth)
      .send({ word: '  empirical  ' })
      .expect(201);
    expect(callCounts.explain).toBe(explainBefore + 1);
    expect(cachedRes.body.data).toMatchObject({ id: explanationId, cached: true });

    const rowsAfterRepeat = await db
      .select()
      .from(readingExplanations)
      .where(
        and(
          eq(readingExplanations.readingId, readingId),
          eq(readingExplanations.normalizedWord, 'empirical'),
        ),
      );
    expect(rowsAfterRepeat).toHaveLength(1);

    await supertest(server())
      .post(`/api/v1/readings/${readingId}/explanations`)
      .send({ word: 'empirical' })
      .expect(401);

    const emptyWord = await supertest(server())
      .post(`/api/v1/readings/${readingId}/explanations`)
      .set('Authorization', student.auth)
      .send({ word: '' })
      .expect(400);
    expect(emptyWord.body.error.code).toBe('VALIDATION_ERROR');

    await supertest(server())
      .post('/api/v1/readings/99999999/explanations')
      .set('Authorization', student.auth)
      .send({ word: 'empirical' })
      .expect(404);

    await supertest(server())
      .post(`/api/v1/readings/${readingId}/explanations`)
      .set('Authorization', stranger.auth)
      .send({ word: 'empirical' })
      .expect(404);
  });

  it('covers PNL rubric evaluation, DB persistence, streak/history updates, tampered-score guard, and 401/400/404/already-evaluated (#14)', async () => {
    stubMode = 'normal';
    const student = await prepareStudent('eval-flow');
    const stranger = await prepareStudent('eval-stranger');

    const readingRes = await supertest(server())
      .post('/api/v1/readings')
      .set('Authorization', student.auth)
      .send({ category: 'science', language: 'en', difficulty: 'medium', size: 'short' })
      .expect(201);
    const readingId = readingRes.body.data.id as number;

    const summary =
      'The article connects empirical observation with abstract principles so learners retain precise terminology in discourse.';

    // 401 without token
    await supertest(server())
      .post(`/api/v1/readings/${readingId}/evaluate`)
      .send({ userResponse: summary })
      .expect(401);

    // 400 for whitespace-only summary (must not invoke AI)
    const evalCallsBeforeBlank = callCounts.evaluate;
    const blankRes = await supertest(server())
      .post(`/api/v1/readings/${readingId}/evaluate`)
      .set('Authorization', student.auth)
      .send({ userResponse: '                         ' })
      .expect(400);
    expect(blankRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(callCounts.evaluate).toBe(evalCallsBeforeBlank);

    // 404 for unknown reading or non-owner
    await supertest(server())
      .post('/api/v1/readings/99999999/evaluate')
      .set('Authorization', student.auth)
      .send({ userResponse: summary })
      .expect(404);
    await supertest(server())
      .post(`/api/v1/readings/${readingId}/evaluate`)
      .set('Authorization', stranger.auth)
      .send({ userResponse: summary })
      .expect(404);

    // Happy-path weighted rubric: round(90*0.45 + 86*0.35 + 88*0.20) = round(88.2) = 88
    const evalRes = await supertest(server())
      .post(`/api/v1/readings/${readingId}/evaluate`)
      .set('Authorization', student.auth)
      .send({ userResponse: summary })
      .expect(201);

    expect(evalRes.body.data).toMatchObject({
      score: 88,
      passed: true,
      feedback: expect.any(String),
    });

    const [persistedReading] = await db
      .select()
      .from(readings)
      .where(eq(readings.id, readingId))
      .limit(1);
    expect(persistedReading).toMatchObject({
      id: readingId,
      status: 'completed',
      score: 88,
      passed: true,
      userResponse: summary,
    });
    expect(persistedReading?.updatedAt).toBeInstanceOf(Date);

    // Re-evaluating completed reading returns 400 READING_ALREADY_EVALUATED without calling AI or overwriting score.
    const evalCallsBeforeDup = callCounts.evaluate;
    const dupRes = await supertest(server())
      .post(`/api/v1/readings/${readingId}/evaluate`)
      .set('Authorization', student.auth)
      .send({ userResponse: summary })
      .expect(400);
    expect(dupRes.body.error.code).toBe('READING_ALREADY_EVALUATED');
    expect(callCounts.evaluate).toBe(evalCallsBeforeDup);

    // Streak & history reflect completed reading
    const streakRes = await supertest(server())
      .get('/api/v1/user/streak?days=7')
      .set('Authorization', student.auth)
      .expect(200);
    expect(streakRes.body.data.count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(streakRes.body.data.days)).toBe(true);

    const scoresRes = await supertest(server())
      .get('/api/v1/history/scores')
      .set('Authorization', student.auth)
      .expect(200);
    const matchingScore = (scoresRes.body.data as Array<{ readingId: number; score: number }>).find(
      (entry) => entry.readingId === readingId,
    );
    expect(matchingScore).toMatchObject({ readingId, score: 88 });

    // Second reading via POST /evaluation/submit verifies server ignores tampered LLM score=100
    // and enforces rubric formula: round(40*0.45 + 50*0.35 + 50*0.20) = round(45.5) = 46
    const secondReading = await supertest(server())
      .post('/api/v1/readings')
      .set('Authorization', student.auth)
      .send({ category: 'history', language: 'en', difficulty: 'easy', size: 'short' })
      .expect(201);
    const secondId = secondReading.body.data.id as number;

    stubMode = 'tampered-score';
    const tamperedEval = await supertest(server())
      .post('/api/v1/evaluation/submit')
      .set('Authorization', student.auth)
      .send({
        readingId: secondId,
        userResponse: 'A brief incomplete attempt summarizing only part of the topic.',
      })
      .expect(201);
    expect(tamperedEval.body.data).toMatchObject({ score: 46, passed: false });
  });

  it('verifies degraded AI failure modes across generation, evaluation, vocabulary, circuit breaker & process health (#26)', async () => {
    stubMode = 'normal';
    const student = await prepareStudent('degraded-flow');

    const baselineRes = await supertest(server())
      .post('/api/v1/readings')
      .set('Authorization', student.auth)
      .send({ category: 'technology', language: 'en', difficulty: 'medium', size: 'short' })
      .expect(201);
    const pendingReadingId = baselineRes.body.data.id as number;

    const countUserReadings = async (): Promise<number> => {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(readings)
        .where(eq(readings.userId, student.userId));
      return rows[0]?.count ?? 0;
    };

    const initialCount = await countUserReadings();
    expect(initialCount).toBe(1);

    // 1. Reading generation under http-500, invalid-json, and timeout -> clean 503 + zero corrupt rows
    for (const failureMode of ['http-500', 'invalid-json', 'timeout'] as const) {
      stubMode = failureMode;
      const res = await supertest(server())
        .post('/api/v1/readings')
        .set('Authorization', student.auth)
        .send({ category: 'science', language: 'en', difficulty: 'medium', size: 'short' })
        .expect(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);
      assertNoStackLeak(res.body);
      expect(await countUserReadings()).toBe(initialCount);
    }

    const genFailureLogs = await db
      .select()
      .from(promptLogs)
      .where(
        and(eq(promptLogs.userId, student.userId), eq(promptLogs.event, 'text_generation_failed')),
      );
    expect(genFailureLogs.length).toBeGreaterThanOrEqual(1);

    // 2. Reading generation rate-limit -> 429 AI_RATE_LIMITED + zero corrupt rows
    stubMode = 'rate-limit';
    const genRateLimited = await supertest(server())
      .post('/api/v1/readings')
      .set('Authorization', student.auth)
      .send({ category: 'history', language: 'en', difficulty: 'medium', size: 'short' })
      .expect(429);
    expect(genRateLimited.body.error.code).toBe('AI_RATE_LIMITED');
    assertNoStackLeak(genRateLimited.body);
    expect(await countUserReadings()).toBe(initialCount);

    // 3. Evaluation under timeout, invalid-json, and rate-limit keeps pending reading untouched
    const evalPayload = {
      userResponse:
        'A thoughtful summary covering empirical evidence, terminology contrast, and reading coherence.',
    };

    stubMode = 'timeout';
    const evalTimeout = await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/evaluate`)
      .set('Authorization', student.auth)
      .send(evalPayload)
      .expect(503);
    expect(evalTimeout.body.error.code).toBe('SERVICE_UNAVAILABLE');
    assertNoStackLeak(evalTimeout.body);

    stubMode = 'invalid-json';
    const evalInvalid = await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/evaluate`)
      .set('Authorization', student.auth)
      .send(evalPayload)
      .expect(503);
    expect(evalInvalid.body.error.code).toBe('SERVICE_UNAVAILABLE');
    assertNoStackLeak(evalInvalid.body);

    const evalFailureLogs = await db
      .select()
      .from(promptLogs)
      .where(
        and(
          eq(promptLogs.userId, student.userId),
          eq(promptLogs.event, 'reading_evaluation_failed'),
        ),
      )
      .orderBy(desc(promptLogs.createdAt));
    expect(evalFailureLogs.length).toBeGreaterThanOrEqual(1);

    stubMode = 'rate-limit';
    const evalRateLimited = await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/evaluate`)
      .set('Authorization', student.auth)
      .send(evalPayload)
      .expect(429);
    expect(evalRateLimited.body.error.code).toBe('AI_RATE_LIMITED');
    assertNoStackLeak(evalRateLimited.body);

    const [stillPending] = await db
      .select()
      .from(readings)
      .where(eq(readings.id, pendingReadingId))
      .limit(1);
    expect(stillPending?.status).toBe('pending');
    expect(stillPending?.score).toBeNull();
    expect(stillPending?.passed).toBeNull();

    // 4. Contextual vocabulary under http-500 & rate-limit -> 503/429 without corrupt rows
    stubMode = 'http-500';
    const vocabFail = await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/explanations`)
      .set('Authorization', student.auth)
      .send({ word: 'contrast' })
      .expect(503);
    expect(vocabFail.body.error.code).toBe('SERVICE_UNAVAILABLE');
    assertNoStackLeak(vocabFail.body);

    stubMode = 'rate-limit';
    const vocabRateLimit = await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/explanations`)
      .set('Authorization', student.auth)
      .send({ word: 'contrast' })
      .expect(429);
    expect(vocabRateLimit.body.error.code).toBe('AI_RATE_LIMITED');
    assertNoStackLeak(vocabRateLimit.body);

    const vocabRowsAfterFailure = await db
      .select()
      .from(readingExplanations)
      .where(eq(readingExplanations.readingId, pendingReadingId));
    expect(vocabRowsAfterFailure).toHaveLength(0);

    // 5. Process recovers cleanly once provider returns normal responses
    stubMode = 'normal';
    await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/explanations`)
      .set('Authorization', student.auth)
      .send({ word: 'contrast' })
      .expect(201);

    await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/evaluate`)
      .set('Authorization', student.auth)
      .send(evalPayload)
      .expect(201);

    // 6. Deep explanation uses AiDegradedService: 5 consecutive failures open circuit breaker,
    // 6th fails fast with zero upstream calls, and non-AI routes stay 200.
    stubMode = 'http-500';
    for (let i = 0; i < 5; i += 1) {
      const failRes = await supertest(server())
        .post(`/api/v1/readings/${pendingReadingId}/explanations/deep`)
        .set('Authorization', student.auth)
        .send({ word: 'contrast', context: 'When learners contrast empirical evidence.' })
        .expect(503);
      expect(failRes.body.error.code).toBe('SERVICE_UNAVAILABLE');
      assertNoStackLeak(failRes.body);
    }

    const deepCallsBeforeOpen = callCounts.deep;
    const circuitOpenRes = await supertest(server())
      .post(`/api/v1/readings/${pendingReadingId}/explanations/deep`)
      .set('Authorization', student.auth)
      .send({ word: 'contrast' })
      .expect(503);
    expect(circuitOpenRes.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(callCounts.deep).toBe(deepCallsBeforeOpen);

    // Non-AI endpoints remain healthy while AI circuit breaker is open.
    await supertest(server()).get('/api/v1/health/live').expect(200);
    await supertest(server()).get('/api/v1/health/ready').expect(200);
    await supertest(server())
      .get('/api/v1/user/profile')
      .set('Authorization', student.auth)
      .expect(200);
  });
});
