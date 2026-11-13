import { Test } from '@nestjs/testing';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ReadingsService } from './readings.service';
import { AIProviderFactory } from '../ia/providers/ai-provider.factory';
import { PromptBuilderService } from './prompt-generation';
import type { RandomPromptParams } from './prompt-generation/catalog.types';
import { AiResponseParserService } from './ai-response-parser.service';
import { PromptLogService } from './prompt-logs';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CategoryModerationService } from '../moderation/category-moderation.service';
import { DRIZZLE } from '../../database/database.tokens';

describe('ReadingsService', () => {
  let service: ReadingsService;
  let factory: jest.Mocked<Pick<AIProviderFactory, 'getFullResponse'>>;
  let promptGen: jest.Mocked<
    Pick<
      PromptBuilderService,
      | 'buildPrompt'
      | 'generateRandomParams'
      | 'buildEnrichmentPrompt'
      | 'parseEnrichmentResponse'
      | 'buildFallbackEnrichedTopic'
    >
  >;
  let parser: jest.Mocked<
    Pick<AiResponseParserService, 'parseGeneratedText' | 'parseEvaluation' | 'parseExplanation'>
  >;
  let logs: jest.Mocked<Pick<PromptLogService, 'logPromptSuccess' | 'logPromptError'>>;
  let users: jest.Mocked<Pick<UsersService, 'findById'>>;
  let settings: jest.Mocked<Pick<SettingsService, 'getCategories'>>;
  let subscriptions: {
    assertSubscriptionActive: jest.Mock;
    assertCanGenerateReading: jest.Mock;
    assertLanguageAllowed: jest.Mock;
    assertCanAskQuestion: jest.Mock;
    recordExplanation: jest.Mock;
  };
  let moderation: {
    assertCategoryAllowedForReading: jest.Mock;
  };
  let db: { insert: jest.Mock; select: jest.Mock; update: jest.Mock; delete: jest.Mock };

  const buildModuleWithDb = async (dbMock: typeof db): Promise<ReadingsService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReadingsService,
        { provide: AIProviderFactory, useValue: factory },
        { provide: PromptBuilderService, useValue: promptGen },
        { provide: AiResponseParserService, useValue: parser },
        { provide: PromptLogService, useValue: logs },
        { provide: UsersService, useValue: users },
        { provide: SettingsService, useValue: settings },
        { provide: SubscriptionsService, useValue: subscriptions },
        { provide: CategoryModerationService, useValue: moderation },
        { provide: DRIZZLE, useValue: dbMock },
      ],
    }).compile();
    return moduleRef.get(ReadingsService);
  };

  beforeEach(() => {
    factory = { getFullResponse: jest.fn() };
    promptGen = {
      buildPrompt: jest.fn(),
      generateRandomParams: jest.fn(),
      buildEnrichmentPrompt: jest.fn().mockReturnValue({
        systemPrompt: 'enrich_sys',
        userPrompt: 'enrich_usr',
        seed: 'enrich_seed',
      }),
      parseEnrichmentResponse: jest.fn().mockImplementation((_raw, _fallback) => ({
        subtopic: 'Test Subtopic',
        perspective: 'causes',
        uniqueFocusElement: 'its impact on daily life',
        keyConcepts: ['concept1'],
      })),
      buildFallbackEnrichedTopic: jest.fn().mockReturnValue({
        subtopic: 'Fallback Subtopic',
        perspective: 'causes',
        uniqueFocusElement: 'its impact on daily life',
        keyConcepts: [],
      }),
    };
    const realParser = new AiResponseParserService();
    parser = {
      parseGeneratedText: jest.fn(),
      parseEvaluation: jest.fn(),
      parseExplanation: jest.fn((raw: string) => realParser.parseExplanation(raw)),
    };
    logs = { logPromptSuccess: jest.fn(), logPromptError: jest.fn() };
    subscriptions = {
      assertSubscriptionActive: jest.fn().mockResolvedValue(undefined),
      assertCanGenerateReading: jest.fn().mockResolvedValue(undefined),
      assertLanguageAllowed: jest.fn().mockResolvedValue(undefined),
      assertCanAskQuestion: jest.fn().mockResolvedValue(undefined),
      recordExplanation: jest.fn().mockResolvedValue(undefined),
    };
    moderation = {
      assertCategoryAllowedForReading: jest.fn().mockResolvedValue(undefined),
    };
    settings = {
      getCategories: jest
        .fn()
        .mockResolvedValue([
          'technology',
          'history',
          'education',
          'programming',
          'culture',
          'pop_culture',
        ]),
    };
    users = {
      findById: jest.fn().mockResolvedValue({
        id: 42,
        email: 'a@b.c',
        fullName: 'A B',
        currentStreak: 0,
        lastStreakDate: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
        password: 'hash',
      }),
    };

    const insertedReading = {
      id: 1,
      userId: 42,
      status: 'pending',
      title: 'X',
      description: 'X',
      content: 'X',
      category: 'technology' as const,
      difficulty: 'easy' as const,
      wordCount: 100,
      score: null,
      passed: null,
      createdAt: new Date(),
      updatedAt: null,
      deletedAt: null,
    };
    const insertChain = {
      values: jest
        .fn()
        .mockReturnValue({ returning: jest.fn().mockResolvedValue([insertedReading]) }),
    };
    db = {
      insert: jest.fn().mockReturnValue(insertChain),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([insertedReading]),
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([insertedReading]),
            }),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ ...insertedReading, status: 'completed' }]),
          }),
        }),
      }),
      delete: jest.fn(),
    };
  });

  describe('generate', () => {
    const makeDbReturning = (
      returned: Record<string, unknown>,
    ): { insert: jest.Mock; select: jest.Mock; update: jest.Mock; delete: jest.Mock } => {
      const insertChain = {
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([returned]) }),
      };
      return {
        insert: jest.fn().mockReturnValue(insertChain),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([returned]),
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([returned]),
              }),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ ...returned, status: 'completed' }]),
            }),
          }),
        }),
        delete: jest.fn(),
      };
    };

    it('calls the AI provider, parses the response, and saves the reading', async () => {
      const params: RandomPromptParams = {
        category: 'history',
        difficulty: 'medium',
        size: 'medium',
        subcategories: ['Subcategory test'],
        contentType: 'interesting_discovery',
        perspective: 'causes',
        uniqueFocusElement: 'its impact on daily life',
      };
      promptGen.generateRandomParams.mockReturnValue(params);
      promptGen.buildPrompt.mockReturnValue({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        seed: 'seed-1',
        params,
      });
      factory.getFullResponse.mockResolvedValue(
        '{"title":"T","description":"D","content":"C","category":"history","difficulty":"medium"}',
      );
      const returned = {
        id: 1,
        userId: 42,
        status: 'pending',
        title: 'T',
        description: 'D',
        content: 'C',
        category: 'history' as const,
        difficulty: 'medium' as const,
        wordCount: 1,
        score: null,
        passed: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      parser.parseGeneratedText.mockReturnValue(returned);
      const localDb = makeDbReturning(returned);
      service = await buildModuleWithDb(localDb);

      const result = await service.generate({
        userId: 42,
        options: { category: 'history', difficulty: 'medium', size: 'medium', language: 'en' },
      });

      expect(promptGen.generateRandomParams).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'history',
          difficulty: 'medium',
          size: 'medium',
        }),
      );
      expect(promptGen.buildPrompt).toHaveBeenCalledWith(params);
      expect(factory.getFullResponse).toHaveBeenCalled();
      expect(parser.parseGeneratedText).toHaveBeenCalled();
      expect(result.id).toBe(1);
      expect(result.title).toBe('T');
    });

    it('passes the client-controlled category/difficulty/size to the prompt generator verbatim', async () => {
      const params: RandomPromptParams = {
        category: 'programming',
        difficulty: 'hard',
        size: 'medium',
        subcategories: ['Subcategory test'],
        contentType: 'interesting_discovery',
        perspective: 'causes',
        uniqueFocusElement: 'its impact on daily life',
      };
      promptGen.generateRandomParams.mockReturnValue(params);
      promptGen.buildPrompt.mockReturnValue({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        seed: 'seed-2',
        params,
      });
      factory.getFullResponse.mockResolvedValue(
        '{"title":"T","description":"D","content":"C","category":"programming","difficulty":"hard"}',
      );
      const returned = {
        id: 2,
        userId: 42,
        status: 'pending',
        title: 'T',
        description: 'D',
        content: 'C',
        category: 'programming' as const,
        difficulty: 'hard' as const,
        wordCount: 1,
        score: null,
        passed: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      parser.parseGeneratedText.mockReturnValue(returned);
      const localDb = makeDbReturning(returned);
      service = await buildModuleWithDb(localDb);

      await service.generate({
        userId: 42,
        options: { category: 'programming', difficulty: 'hard', size: 'medium', language: 'fr' },
      });

      // buildPrompt receives the user-chosen category/difficulty/size inside
      // the params bag (the system fills in subcategories/contentType/etc.).
      expect(promptGen.buildPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'programming',
          difficulty: 'hard',
          size: 'medium',
        }),
      );
    });

    it('defaults difficulty to medium and size to medium when only category is given', async () => {
      const params: RandomPromptParams = {
        category: 'culture',
        difficulty: 'medium',
        size: 'medium',
        subcategories: ['Subcategory test'],
        contentType: 'interesting_discovery',
        perspective: 'causes',
        uniqueFocusElement: 'its impact on daily life',
      };
      promptGen.generateRandomParams.mockReturnValue(params);
      promptGen.buildPrompt.mockReturnValue({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        seed: 'seed-3',
        params,
      });
      factory.getFullResponse.mockResolvedValue(
        '{"title":"T","description":"D","content":"C","category":"culture","difficulty":"medium"}',
      );
      const returned = {
        id: 3,
        userId: 42,
        status: 'pending',
        title: 'T',
        description: 'D',
        content: 'C',
        category: 'culture' as const,
        difficulty: 'medium' as const,
        wordCount: 1,
        score: null,
        passed: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      parser.parseGeneratedText.mockReturnValue(returned);
      const localDb = makeDbReturning(returned);
      service = await buildModuleWithDb(localDb);

      await service.generate({ userId: 42, options: { category: 'culture', language: 'es' } });

      expect(promptGen.buildPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'culture',
          difficulty: 'medium',
          size: 'medium',
        }),
      );
    });

    it('throws BadRequestException if AI returns no usable JSON', async () => {
      promptGen.buildPrompt.mockReturnValue({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        seed: 's',
        params: {
          category: 'history',
          difficulty: 'medium',
          size: 'medium',
          subcategories: ['Subcategory test'],
          contentType: 'interesting_discovery',
          perspective: 'causes',
          uniqueFocusElement: 'its impact on daily life',
        },
      });
      factory.getFullResponse.mockResolvedValue('no json here');
      parser.parseGeneratedText.mockImplementation(() => {
        throw new Error('No JSON object found in response');
      });
      service = await buildModuleWithDb(db);
      await expect(
        service.generate({
          userId: 42,
          options: { category: 'history', difficulty: 'medium', language: 'en' },
        }),
      ).rejects.toBeInstanceOf(AppHttpException);
    });

    it('rejects with VALIDATION_ERROR when target language is missing', async () => {
      service = await buildModuleWithDb(db);

      await expect(
        service.generate({
          userId: 42,
          options: { category: 'history' } as never,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      });
      expect(subscriptions.assertLanguageAllowed).not.toHaveBeenCalled();
    });

    it('rejects with RESOURCE_FORBIDDEN if category is not in user preferences', async () => {
      settings.getCategories.mockResolvedValue(['technology', 'history']);
      service = await buildModuleWithDb(db);

      await expect(
        service.generate({
          userId: 42,
          options: { category: 'gastronomy', difficulty: 'medium', language: 'en' },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'RESOURCE_FORBIDDEN',
        }),
      });
    });

    it('supports custom dynamic categories if they are in user preferences', async () => {
      settings.getCategories.mockResolvedValue(['quantum_physics']);
      const params: RandomPromptParams = {
        category: 'quantum_physics',
        difficulty: 'hard',
        size: 'long',
        subcategories: ['Quantum Entanglement'],
        contentType: 'interesting_discovery',
        perspective: 'causes',
        uniqueFocusElement: 'the paradox of spooky action at a distance',
        keyConcepts: ['entanglement', 'Bell inequality'],
      };
      promptGen.generateRandomParams.mockReturnValue(params);
      promptGen.buildPrompt.mockReturnValue({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        seed: 'seed-qp',
        params,
      });
      factory.getFullResponse.mockResolvedValue(
        '{"title":"Quantum Wonders","description":"D","content":"C","category":"quantum_physics","difficulty":"hard"}',
      );
      const returned = {
        id: 99,
        userId: 42,
        status: 'pending',
        title: 'Quantum Wonders',
        description: 'D',
        content: 'C',
        category: 'quantum_physics',
        difficulty: 'hard' as const,
        wordCount: 100,
        score: null,
        passed: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      parser.parseGeneratedText.mockReturnValue(returned);
      const localDb = makeDbReturning(returned);
      service = await buildModuleWithDb(localDb);

      const result = await service.generate({
        userId: 42,
        options: { category: 'quantum_physics', difficulty: 'hard', size: 'long', language: 'it' },
      });

      expect(result.category).toBe('quantum_physics');
      expect(promptGen.buildEnrichmentPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'quantum_physics' }),
      );
    });

    it('passes recent titles to the enrichment prompt to prevent repetition', async () => {
      const recentReading1 = { title: 'Steam Engine Revolution' };
      const recentReading2 = { title: 'Printing Press Evolution' };
      const queryResult = [recentReading1, recentReading2];
      const orderByChain: any = Promise.resolve(queryResult);
      orderByChain.limit = jest.fn().mockResolvedValue(queryResult);

      const selectWithTitles = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue(orderByChain),
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      };
      const returned = {
        id: 101,
        userId: 42,
        status: 'pending',
        title: 'Industrial Age',
        description: 'D',
        content: 'C',
        category: 'history',
        difficulty: 'medium' as const,
        wordCount: 100,
        score: null,
        passed: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      parser.parseGeneratedText.mockReturnValue(returned);
      promptGen.buildPrompt.mockReturnValue({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        seed: 'seed-titles',
        params: {
          category: 'history',
          difficulty: 'medium',
          size: 'medium',
          subcategories: ['Subcategory test'],
          contentType: 'interesting_discovery',
          perspective: 'causes',
          uniqueFocusElement: 'its impact on daily life',
        },
      });
      factory.getFullResponse.mockResolvedValue(
        '{"title":"Industrial Age","description":"D","content":"C","category":"history","difficulty":"medium"}',
      );
      const localDb = {
        ...makeDbReturning(returned),
        select: jest.fn().mockReturnValue(selectWithTitles),
      };
      service = await buildModuleWithDb(localDb);

      await service.generate({
        userId: 42,
        options: { category: 'history', difficulty: 'medium', language: 'en' },
      });

      expect(promptGen.buildEnrichmentPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'history',
          recentTitles: expect.arrayContaining([
            'Steam Engine Revolution',
            'Printing Press Evolution',
          ]),
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns the reading if it exists and belongs to the user', async () => {
      service = await buildModuleWithDb(db);
      const result = await service.findById(1, 42);
      expect(result.id).toBe(1);
      expect(result.userId).toBe(42);
    });

    it('throws NotFoundException if reading belongs to a different user', async () => {
      const otherUserReading = {
        id: 1,
        userId: 99,
        status: 'pending',
        title: 'X',
        description: 'X',
        content: 'X',
        category: 'technology' as const,
        difficulty: 'easy' as const,
        wordCount: 100,
        score: null,
        passed: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      const dbOther = {
        ...db,
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest
              .fn()
              .mockReturnValue({ limit: jest.fn().mockResolvedValue([otherUserReading]) }),
          }),
        }),
      };
      service = await buildModuleWithDb(dbOther);
      await expect(service.findById(1, 42)).rejects.toBeInstanceOf(AppHttpException);
    });
  });

  describe('evaluate', () => {
    it('saves the score and marks the reading as completed', async () => {
      parser.parseEvaluation.mockReturnValue({ score: 85, passed: true, feedback: 'Good' });
      service = await buildModuleWithDb(db);
      const result = await service.evaluate(1, 42, { userResponse: 'I understood the text well' });
      expect(result.score).toBe(85);
      expect(result.passed).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });

    it('persists the user response and the AI feedback on the reading row', async () => {
      // The schema previously only stored score/passed. We now persist the
      // user's written summary AND the AI feedback so the mobile client can
      // re-display both later from a plain GET /readings/{id} without making
      // the client re-call the LLM.
      parser.parseEvaluation.mockReturnValue({
        score: 88,
        passed: true,
        feedback: 'Captured the main idea accurately.',
      });
      service = await buildModuleWithDb(db);
      await service.evaluate(7, 42, { userResponse: 'The robots help clean oceans.' });

      // The SQL SET must include userResponse + feedback so the live row
      // has them after evaluation completes.
      const setArg = db.update.mock.results[0]?.value?.set?.mock?.calls?.[0]?.[0] ?? {};
      expect(setArg).toMatchObject({
        score: 88,
        passed: true,
        status: 'completed',
        userResponse: 'The robots help clean oceans.',
        feedback: 'Captured the main idea accurately.',
      });
      expect(setArg).toHaveProperty('updatedAt');
    });
  });

  describe('findById after evaluation', () => {
    it('returns the persisted userResponse and feedback of an evaluated reading', async () => {
      // After evaluation completes, GET /readings/{id} must include the
      // stored userResponse and feedback so the app can render history.
      parser.parseEvaluation.mockReturnValue({
        score: 92,
        passed: true,
        feedback: 'Excellent summary.',
      });
      let capturedUpdateSet: Record<string, unknown> = {};
      const dbWithCapture = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 8,
                userId: 42,
                title: 't',
                description: 'd',
                content: 'c',
                category: 'technology',
                difficulty: 'easy',
                wordCount: 80,
                status: 'completed',
                score: 92,
                passed: true,
                userResponse: 'My detailed summary.',
                feedback: 'Excellent summary.',
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
              },
            ]),
          }),
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                // Initial findById() returns a pending reading so the
                // already-evaluated guard in evaluate() does not fire.
                // The subsequent returning() inside update() returns the
                // completed shape.
                {
                  id: 8,
                  userId: 42,
                  title: 't',
                  description: 'd',
                  content: 'c',
                  category: 'technology',
                  difficulty: 'easy',
                  wordCount: 80,
                  status: 'pending',
                  score: null,
                  passed: null,
                  userResponse: null,
                  feedback: null,
                  createdAt: new Date(),
                  updatedAt: null,
                  deletedAt: null,
                },
                {
                  id: 8,
                  userId: 42,
                  title: 't',
                  description: 'd',
                  content: 'c',
                  category: 'technology',
                  difficulty: 'easy',
                  wordCount: 80,
                  status: 'completed',
                  score: 92,
                  passed: true,
                  userResponse: 'My detailed summary.',
                  feedback: 'Excellent summary.',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                },
              ]),
            }),
          }),
        }),
        update: jest.fn().mockImplementation(() => {
          const api: any = {
            set: jest.fn((s) => {
              capturedUpdateSet = s;
              return api;
            }),
            where: jest.fn(() => ({
              returning: jest.fn().mockResolvedValue([
                {
                  id: 8,
                  userId: 42,
                  title: 't',
                  description: 'd',
                  content: 'c',
                  category: 'technology',
                  difficulty: 'easy',
                  wordCount: 80,
                  status: 'completed',
                  score: 92,
                  passed: true,
                  userResponse: 'My detailed summary.',
                  feedback: 'Excellent summary.',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                },
              ]),
            })),
          };
          return api;
        }),
        delete: jest.fn(),
      };
      // The existing top-level `db` mock is a different shape (see
      // buildModuleWithDb). We only need evaluate here, not the full
      // service surface, so replace the binding at the DB token.
      const moduleRef = await Test.createTestingModule({
        providers: [
          ReadingsService,
          { provide: AIProviderFactory, useValue: factory },
          { provide: PromptBuilderService, useValue: promptGen },
          { provide: AiResponseParserService, useValue: parser },
          { provide: PromptLogService, useValue: logs },
          { provide: UsersService, useValue: users },
          { provide: SettingsService, useValue: settings },
          { provide: SubscriptionsService, useValue: subscriptions },
          { provide: CategoryModerationService, useValue: moderation },
          { provide: DRIZZLE, useValue: dbWithCapture },
        ],
      }).compile();
      const localService = moduleRef.get(ReadingsService);

      await localService.evaluate(8, 42, { userResponse: 'My detailed summary.' });

      // The persisted SET contract: the SQL store got a row with feedback
      // and userResponse populated.
      expect(capturedUpdateSet).toMatchObject({
        score: 92,
        passed: true,
        status: 'completed',
        userResponse: 'My detailed summary.',
        feedback: 'Excellent summary.',
      });
    });
  });

  describe('generate — category moderation enforcement', () => {
    it('calls assertCategoryAllowedForReading and rejects without calling AI generation when moderation fails', async () => {
      settings.getCategories.mockResolvedValue(['Muertos']);
      moderation.assertCategoryAllowedForReading.mockRejectedValue(
        new AppHttpException(ErrorCode.CATEGORY_MODERATION_REJECTED, {
          rejected: [
            {
              category: 'Muertos',
              layer: 'blacklist',
              reason: 'sensitive_death_or_violence_term',
            },
          ],
        }),
      );
      const localService = await buildModuleWithDb(db);

      let caught: AppHttpException | null = null;
      try {
        await localService.generate({
          userId: 42,
          options: { category: 'Muertos', language: 'es' },
        });
      } catch (err) {
        caught = err as AppHttpException;
      }

      expect(caught).toBeInstanceOf(AppHttpException);
      expect(caught?.getStatus()).toBe(400);
      expect(caught?.getResponse()).toMatchObject({
        code: ErrorCode.CATEGORY_MODERATION_REJECTED,
      });

      expect(moderation.assertCategoryAllowedForReading).toHaveBeenCalledWith('Muertos');
      expect(factory.getFullResponse).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('matches user preference by canonical key (case/accent-insensitive) before checking moderation', async () => {
      settings.getCategories.mockResolvedValue(['Día de Muertos']);
      moderation.assertCategoryAllowedForReading.mockRejectedValue(
        new AppHttpException(ErrorCode.CATEGORY_MODERATION_REJECTED),
      );
      const localService = await buildModuleWithDb(db);

      await expect(
        localService.generate({
          userId: 42,
          options: { category: 'dia de muertos', language: 'es' },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ErrorCode.CATEGORY_MODERATION_REJECTED,
        }),
      });

      expect(moderation.assertCategoryAllowedForReading).toHaveBeenCalledWith('dia de muertos');
    });
  });

  describe('multilingual generate, evaluate and explain (es, en, fr, it)', () => {
    it('persists target language in readings row & prompt logs and uses it in evaluate/explain prompts', async () => {
      const frenchReading = {
        id: 19,
        userId: 42,
        status: 'pending',
        title: 'La Révolution Culinaire',
        description: 'Les techniques modernes de fermentation.',
        content: 'La fermentation transforme les saveurs.',
        category: 'gastronomie',
        difficulty: 'medium',
        language: 'fr',
        wordCount: 5,
        score: null,
        passed: null,
        userResponse: null,
        feedback: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      settings.getCategories.mockResolvedValue(['gastronomie']);
      parser.parseGeneratedText.mockReturnValue({
        title: frenchReading.title,
        description: frenchReading.description,
        content: frenchReading.content,
        category: 'gastronomie',
        difficulty: 'medium',
      });
      const genParams: RandomPromptParams = {
        category: 'gastronomie',
        difficulty: 'medium',
        size: 'medium',
        language: 'fr',
        subcategories: ['fermentation'],
        contentType: 'how_it_works',
        perspective: 'process',
        uniqueFocusElement: 'bactéries lactiques',
      };
      promptGen.generateRandomParams.mockReturnValue(genParams);
      promptGen.buildPrompt.mockReturnValue({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        seed: 'seed-fr',
        params: genParams,
      });

      const insertedValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([frenchReading]),
      });
      const localDb = {
        ...db,
        insert: jest.fn().mockReturnValue({ values: insertedValues }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() => ({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
              limit: jest.fn().mockResolvedValue([frenchReading]),
            })),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ ...frenchReading, status: 'completed' }]),
            }),
          }),
        }),
      };
      service = await buildModuleWithDb(localDb);

      await service.generate({
        userId: 42,
        options: { category: 'gastronomie', difficulty: 'medium', size: 'medium', language: 'fr' },
      });
      expect(insertedValues).toHaveBeenCalledWith(expect.objectContaining({ language: 'fr' }));
      expect(logs.logPromptSuccess).toHaveBeenCalledWith(
        'text_generated',
        42,
        19,
        'seed-fr',
        expect.objectContaining({ language: 'fr' }),
      );

      factory.getFullResponse.mockResolvedValueOnce(
        '<think>Evaluation en cours</think>{"explanation":"La fermentation transforme les aliments."}',
      );
      const explained = await service.explain(19, 42, 'fermentation', frenchReading.content);
      expect(explained.explanation).toBe('La fermentation transforme les aliments.');
      expect(factory.getFullResponse).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('French vocabulary explainer'),
          }),
        ]),
      );

      parser.parseEvaluation.mockReturnValue({
        score: 90,
        passed: true,
        feedback: 'Très bonne compréhension.',
      });
      await service.evaluate(19, 42, { userResponse: 'La fermentation change les saveurs.' });
      expect(factory.getFullResponse).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('French reading comprehension evaluator'),
          }),
        ]),
      );
    });
  });
});
