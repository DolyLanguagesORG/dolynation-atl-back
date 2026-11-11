import { Test } from '@nestjs/testing';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { DRIZZLE } from '../../database/database.tokens';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let dbMock: {
    select: jest.Mock;
    update: jest.Mock;
    insert: jest.Mock;
  };

  beforeEach(async () => {
    dbMock = {
      select: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SubscriptionsService, { provide: DRIZZLE, useValue: dbMock }],
    }).compile();

    service = moduleRef.get(SubscriptionsService);
  });

  describe('getPlans', () => {
    it('returns the 3 catalog tiers with their corresponding constraints', () => {
      const plans = service.getPlans();
      expect(plans).toHaveLength(3);

      const dolly = plans.find((p) => p.id === 'dolly')!;
      expect(dolly).toBeDefined();
      expect(dolly.name).toBe('Dolly');
      expect(dolly.maxCategories).toBe(5);
      expect(dolly.allowedLanguages).toEqual(['en']);
      expect(dolly.dailyReadingsLimit).toBe(10);
      expect(dolly.dailyQuestionsLimit).toBe(15);

      const plus = plans.find((p) => p.id === 'dolly_plus')!;
      expect(plus).toBeDefined();
      expect(plus.name).toBe('Dolly Plus');
      expect(plus.maxCategories).toBe(15);
      expect(plus.dailyReadingsLimit).toBe(20);
      expect(plus.dailyQuestionsLimit).toBe(30);
      expect(plus.allowedLanguages).toContain('es');

      const pro = plans.find((p) => p.id === 'dolly_pro')!;
      expect(pro).toBeDefined();
      expect(pro.name).toBe('Dolly Pro');
      expect(pro.maxCategories).toBeNull();
      expect(pro.dailyReadingsLimit).toBeNull();
      expect(pro.dailyQuestionsLimit).toBeNull();
    });
  });

  describe('getUserSubscription', () => {
    it('returns hasSubscription: false when user has no tier configured (new user)', async () => {
      // Mock user select
      const selectUserChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, subscriptionTier: null }]),
          }),
        }),
      };
      // Mock user_settings select
      const selectSettingsChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ categories: ['tech'] }]),
          }),
        }),
      };
      // Mock readings count select
      const selectReadingsChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      };
      // Mock explanations count select
      const selectQuestionsChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 0 }]),
        }),
      };

      dbMock.select
        .mockReturnValueOnce(selectUserChain)
        .mockReturnValueOnce(selectSettingsChain)
        .mockReturnValueOnce(selectReadingsChain)
        .mockReturnValueOnce(selectQuestionsChain);

      const result = await service.getUserSubscription(1);
      expect(result.hasSubscription).toBe(false);
      expect(result.tier).toBeNull();
      expect(result.plan).toBeNull();
      expect(result.usage.categoriesCount).toBe(1);
      expect(result.usage.categoriesLimit).toBeNull();
    });

    it('returns tier, plan details, and remaining counters for an active Dolly user', async () => {
      dbMock.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ id: 1, subscriptionTier: 'dolly' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ categories: ['tech', 'history'] }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 3 }]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 5 }]),
          }),
        });

      const result = await service.getUserSubscription(1);
      expect(result.hasSubscription).toBe(true);
      expect(result.tier).toBe('dolly');
      expect(result.plan?.name).toBe('Dolly');
      expect(result.usage.readingsCreatedToday).toBe(3);
      expect(result.usage.readingsLimit).toBe(10);
      expect(result.usage.readingsRemainingToday).toBe(7);
      expect(result.usage.questionsAskedToday).toBe(5);
      expect(result.usage.questionsLimit).toBe(15);
      expect(result.usage.questionsRemainingToday).toBe(10);
    });
  });

  describe('selectSubscription', () => {
    it('throws 400 SUBSCRIPTION_INVALID_TIER for invalid tier string', async () => {
      await expect(service.selectSubscription(1, 'non_existent_tier' as never)).rejects.toThrow(
        AppHttpException,
      );
    });

    it('updates user subscription_tier and returns fresh status', async () => {
      dbMock.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 1 }]),
          }),
        }),
      });

      // getUserSubscription mock query chain
      dbMock.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ id: 1, subscriptionTier: 'dolly_plus' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ categories: [] }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 0 }]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 0 }]),
          }),
        });

      const res = await service.selectSubscription(1, 'dolly_plus');
      expect(res.tier).toBe('dolly_plus');
      expect(res.plan?.name).toBe('Dolly Plus');
    });
  });

  describe('assertSubscriptionActive', () => {
    it('throws SUBSCRIPTION_REQUIRED if user has no tier selected (null)', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: null }]),
          }),
        }),
      });

      let error: AppHttpException | null = null;
      try {
        await service.assertSubscriptionActive(1);
      } catch (err) {
        error = err as AppHttpException;
      }
      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getStatus()).toBe(403);
    });

    it('returns plan configuration if user has active tier', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
          }),
        }),
      });

      const plan = await service.assertSubscriptionActive(1);
      expect(plan.id).toBe('dolly');
    });
  });

  describe('assertCategoryLimit', () => {
    it('throws SUBSCRIPTION_CATEGORY_LIMIT_EXCEEDED when exceeding plan limit', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
          }),
        }),
      });

      // Dolly allows at most 5 categories; requesting 6 should fail
      let error: AppHttpException | null = null;
      try {
        await service.assertCategoryLimit(1, 6);
      } catch (err) {
        error = err as AppHttpException;
      }
      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getStatus()).toBe(400);
    });

    it('passes when within plan limit', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
          }),
        }),
      });

      await expect(service.assertCategoryLimit(1, 5)).resolves.toBeUndefined();
    });

    it('passes for any count on unlimited pro tier', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly_pro' }]),
          }),
        }),
      });

      await expect(service.assertCategoryLimit(1, 100)).resolves.toBeUndefined();
    });
  });

  describe('assertLanguageAllowed', () => {
    it('throws SUBSCRIPTION_LANGUAGE_NOT_ALLOWED if basic plan requests non-English language', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
          }),
        }),
      });

      let error: AppHttpException | null = null;
      try {
        await service.assertLanguageAllowed(1, 'es');
      } catch (err) {
        error = err as AppHttpException;
      }
      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getStatus()).toBe(403);
    });

    it('allows English on basic plan', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
          }),
        }),
      });

      await expect(service.assertLanguageAllowed(1, 'en')).resolves.toBeUndefined();
    });

    it('allows all system languages on Plus and Pro tiers', async () => {
      dbMock.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly_plus' }]),
          }),
        }),
      });

      await expect(service.assertLanguageAllowed(1, 'fr')).resolves.toBeUndefined();
    });
  });

  describe('assertCanGenerateReading', () => {
    it('throws READING_DAILY_LIMIT_REACHED (429) when basic plan reaches 10 daily readings', async () => {
      // 1. User tier
      dbMock.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
            }),
          }),
        })
        // 2. Readings count
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 10 }]),
          }),
        });

      let error: AppHttpException | null = null;
      try {
        await service.assertCanGenerateReading(1);
      } catch (err) {
        error = err as AppHttpException;
      }
      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getStatus()).toBe(429);
    });

    it('passes if basic plan has used fewer than 10 readings', async () => {
      dbMock.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 9 }]),
          }),
        });

      await expect(service.assertCanGenerateReading(1)).resolves.toBeUndefined();
    });
  });

  describe('assertCanAskQuestion', () => {
    it('throws EXPLANATION_DAILY_LIMIT_REACHED (429) when basic plan reaches 15 questions', async () => {
      dbMock.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 15 }]),
          }),
        });

      let error: AppHttpException | null = null;
      try {
        await service.assertCanAskQuestion(1);
      } catch (err) {
        error = err as AppHttpException;
      }
      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getStatus()).toBe(429);
    });

    it('passes if basic plan has used fewer than 15 questions', async () => {
      dbMock.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 14 }]),
          }),
        });

      await expect(service.assertCanAskQuestion(1)).resolves.toBeUndefined();
    });
  });

  describe('recordExplanation', () => {
    it('inserts a row into reading_explanations', async () => {
      const insertChain = {
        values: jest.fn().mockResolvedValue(undefined),
      };
      dbMock.insert.mockReturnValue(insertChain);

      await service.recordExplanation({
        readingId: 10,
        userId: 1,
        word: 'ubiquitous',
        context: 'Smartphones are ubiquitous.',
        explanation: 'Present everywhere.',
      });

      expect(dbMock.insert).toHaveBeenCalled();
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          readingId: 10,
          userId: 1,
          word: 'ubiquitous',
          explanation: 'Present everywhere.',
        }),
      );
    });
  });
});
