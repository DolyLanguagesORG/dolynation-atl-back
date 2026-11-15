import { Test } from '@nestjs/testing';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let service: jest.Mocked<
    Pick<SubscriptionsService, 'getPlans' | 'getUserSubscription' | 'selectSubscription'>
  >;
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };

  beforeEach(async () => {
    service = {
      getPlans: jest.fn().mockReturnValue([
        {
          id: 'dolly',
          name: 'Dolly',
          description: 'Basic',
          maxCategories: 5,
          maxLanguages: 1,
          allowedLanguages: ['es', 'en', 'fr', 'it'],
          dailyReadingsLimit: 10,
          dailyQuestionsLimit: 15,
        },
      ]),
      getUserSubscription: jest.fn().mockResolvedValue({
        hasSubscription: true,
        tier: 'dolly',
        plan: {
          id: 'dolly',
          name: 'Dolly',
          description: 'Basic',
          maxCategories: 5,
          maxLanguages: 1,
          allowedLanguages: ['es', 'en', 'fr', 'it'],
          dailyReadingsLimit: 10,
          dailyQuestionsLimit: 15,
        },
        usage: {
          categoriesCount: 2,
          categoriesLimit: 5,
          languagesCount: 1,
          languagesLimit: 1,
          readingsCreatedToday: 1,
          readingsLimit: 10,
          readingsRemainingToday: 9,
          questionsAskedToday: 3,
          questionsLimit: 15,
          questionsRemainingToday: 12,
        },
      }),
      selectSubscription: jest.fn().mockResolvedValue({
        hasSubscription: true,
        tier: 'dolly_plus',
        plan: {
          id: 'dolly_plus',
          name: 'Dolly Plus',
          description: 'Plus',
          maxCategories: 15,
          maxLanguages: 2,
          allowedLanguages: ['es', 'en', 'fr', 'it'],
          dailyReadingsLimit: 20,
          dailyQuestionsLimit: 30,
        },
        usage: {
          categoriesCount: 2,
          categoriesLimit: 15,
          languagesCount: 2,
          languagesLimit: 2,
          readingsCreatedToday: 0,
          readingsLimit: 20,
          readingsRemainingToday: 20,
          questionsAskedToday: 0,
          questionsLimit: 30,
          questionsRemainingToday: 30,
        },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [{ provide: SubscriptionsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(SubscriptionsController);
  });

  describe('GET /subscriptions/plans', () => {
    it('returns the plans catalog in envelope format', () => {
      const result = controller.getPlans();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('dolly');
      expect(result.message).toBe('Subscription plans');
    });
  });

  describe('GET /user/subscription', () => {
    it('returns the current user’s subscription status and daily counters', async () => {
      const result = await controller.getCurrentSubscription(user);
      expect(result.data.tier).toBe('dolly');
      expect(result.data.usage.readingsRemainingToday).toBe(9);
      expect(service.getUserSubscription).toHaveBeenCalledWith(42);
    });
  });

  describe('POST /user/subscription', () => {
    it('activates the chosen plan and returns the updated status', async () => {
      const result = await controller.selectSubscription(user, { tier: 'dolly_plus' });
      expect(result.data.tier).toBe('dolly_plus');
      expect(service.selectSubscription).toHaveBeenCalledWith(42, 'dolly_plus');
    });
  });
});
