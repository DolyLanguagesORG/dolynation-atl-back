import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { DrizzleDb } from '../../database/database.module';
import type { CategoryModerationService } from '../moderation/category-moderation.service';
import { SUBSCRIPTION_PLANS } from '../subscriptions/subscriptions.constants';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let onConflictDoUpdate: jest.Mock;
  let values: jest.Mock;
  let selectLimit: jest.Mock;
  let db: { insert: jest.Mock; select: jest.Mock };
  let moderation: jest.Mocked<Pick<CategoryModerationService, 'assertCategoriesAllowed'>>;
  let subscriptions: { assertSubscriptionActive: jest.Mock };
  let service: SettingsService;

  const mockSettingsRow = (row: Record<string, unknown> | null): void => {
    selectLimit.mockResolvedValue(row ? [row] : []);
  };

  beforeEach(() => {
    onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    selectLimit = jest.fn().mockResolvedValue([]);
    db = {
      insert: jest.fn().mockReturnValue({ values }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: selectLimit,
          }),
        }),
      }),
    };
    moderation = {
      assertCategoriesAllowed: jest
        .fn()
        .mockImplementation((cats: readonly string[]) => Promise.resolve([...cats])),
    };
    subscriptions = {
      assertSubscriptionActive: jest.fn().mockResolvedValue(SUBSCRIPTION_PLANS.dolly),
    };

    service = new SettingsService(
      db as unknown as DrizzleDb,
      moderation as unknown as CategoryModerationService,
      subscriptions as unknown as SubscriptionsService,
    );
  });

  describe('categories', () => {
    it('moderates, normalizes, persists and returns allowed categories', async () => {
      moderation.assertCategoriesAllowed.mockResolvedValueOnce(['technology', 'Día de Muertos']);

      const result = await service.setCategories(42, ['  Technology ', 'Día de Muertos']);

      expect(moderation.assertCategoriesAllowed).toHaveBeenCalledWith([
        '  Technology ',
        'Día de Muertos',
      ]);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          preferredCategories: ['technology', 'Día de Muertos'],
        }),
      );
      expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['technology', 'Día de Muertos']);
    });

    it('aborts persistence and propagates CATEGORY_MODERATION_REJECTED when moderation rejects', async () => {
      const error = new AppHttpException(ErrorCode.CATEGORY_MODERATION_REJECTED, {
        rejected: [
          {
            category: 'm u e r t o',
            layer: 'blacklist',
            reason: 'sensitive_death_or_violence_term',
          },
        ],
      });
      moderation.assertCategoriesAllowed.mockRejectedValueOnce(error);

      let caught: AppHttpException | null = null;
      try {
        await service.setCategories(42, ['m u e r t o']);
      } catch (err) {
        caught = err as AppHttpException;
      }

      expect(caught).toBeInstanceOf(AppHttpException);
      expect(caught?.getStatus()).toBe(400);
      expect(caught?.getResponse()).toMatchObject({
        code: ErrorCode.CATEGORY_MODERATION_REJECTED,
      });
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('languages & anti-cheat lock', () => {
    it('allows first language selection freely within plan cap and locks future changes for 1 year', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly);
      mockSettingsRow(null);

      const res = await service.setLanguages(42, ['fr']);

      expect(res.selected).toEqual(['fr']);
      expect(res.active).toEqual(['fr']);
      expect(res.maxLanguages).toBe(1);
      expect(res.canChangeFree).toBe(false);
      expect(res.nextFreeChangeAt).not.toBeNull();
      expect(res.languageChangeCredits).toBe(0);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedLanguages: ['fr'],
          preferredLanguage: 'fr',
        }),
      );
    });

    it('rejects exceeding simultaneous plan limit (2 on dolly, 3 on dolly_plus)', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly);

      await expect(service.setLanguages(42, ['es', 'en'])).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCode.SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED }),
      });

      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly_plus);
      await expect(service.setLanguages(42, ['es', 'en', 'it'])).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCode.SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED }),
      });
    });

    it('blocks replacing an already-selected language before 365 days without paid credit', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly);
      const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
      mockSettingsRow({
        selectedLanguages: ['en'],
        lastLanguageChangeAt: tenDaysAgo,
        languageChangeCredits: 0,
      });

      let caught: AppHttpException | null = null;
      try {
        await service.setLanguages(42, ['fr']);
      } catch (err) {
        caught = err as AppHttpException;
      }

      expect(caught).toBeInstanceOf(AppHttpException);
      expect(caught?.getStatus()).toBe(403);
      expect(caught?.getResponse()).toMatchObject({ code: ErrorCode.LANGUAGE_CHANGE_LOCKED });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('allows changing selected language for free once 365 days have elapsed', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly);
      const overOneYearAgo = new Date(Date.now() - 366 * 86_400_000);
      mockSettingsRow({
        selectedLanguages: ['en'],
        lastLanguageChangeAt: overOneYearAgo,
        languageChangeCredits: 1,
      });

      const res = await service.setLanguages(42, ['it']);

      expect(res.selected).toEqual(['it']);
      expect(res.active).toEqual(['it']);
      expect(res.languageChangeCredits).toBe(1);
      expect(res.canChangeFree).toBe(false);
    });

    it('allows filling newly unlocked slots on upgrade without requiring payment or cooldown', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly_plus);
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      mockSettingsRow({
        selectedLanguages: ['en'],
        lastLanguageChangeAt: twoDaysAgo,
        languageChangeCredits: 0,
      });

      const res = await service.setLanguages(42, ['en', 'it']);

      expect(res.selected).toEqual(['en', 'it']);
      expect(res.active).toEqual(['en', 'it']);
      expect(res.lastLanguageChangeAt).toBe(twoDaysAgo.toISOString());
    });

    it('unlockLanguageChange credits 1 swap and setLanguages consumes it without increasing plan slots', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly);
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      mockSettingsRow({
        selectedLanguages: ['en'],
        lastLanguageChangeAt: twoDaysAgo,
        languageChangeCredits: 0,
      });

      const unlocked = await service.unlockLanguageChange(42);
      expect(unlocked.languageChangeCredits).toBe(1);

      mockSettingsRow({
        selectedLanguages: ['en'],
        lastLanguageChangeAt: twoDaysAgo,
        languageChangeCredits: 1,
      });
      const swapped = await service.setLanguages(42, ['fr']);

      expect(swapped.selected).toEqual(['fr']);
      expect(swapped.active).toEqual(['fr']);
      expect(swapped.maxLanguages).toBe(1);
      expect(swapped.languageChangeCredits).toBe(0);
    });

    it('allows free priority reordering while all saved languages are active on dolly_plus', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly_plus);
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      mockSettingsRow({
        selectedLanguages: ['en', 'fr'],
        lastLanguageChangeAt: twoDaysAgo,
        languageChangeCredits: 0,
      });

      const reordered = await service.reorderLanguages(42, ['fr', 'en']);

      expect(reordered.selected).toEqual(['fr', 'en']);
      expect(reordered.active).toEqual(['fr', 'en']);
      expect(reordered.lastLanguageChangeAt).toBe(twoDaysAgo.toISOString());
    });

    it('blocks free promotion of an inactive language after downgrade unless cooldown or credit exists', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly);
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      mockSettingsRow({
        selectedLanguages: ['fr', 'en'],
        lastLanguageChangeAt: twoDaysAgo,
        languageChangeCredits: 0,
      });

      await expect(service.reorderLanguages(42, ['en', 'fr'])).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCode.LANGUAGE_CHANGE_LOCKED }),
      });

      mockSettingsRow({
        selectedLanguages: ['fr', 'en'],
        lastLanguageChangeAt: twoDaysAgo,
        languageChangeCredits: 1,
      });
      const promoted = await service.reorderLanguages(42, ['en', 'fr']);
      expect(promoted.selected).toEqual(['en', 'fr']);
      expect(promoted.active).toEqual(['en']);
      expect(promoted.languageChangeCredits).toBe(0);
    });

    it('keeps all 4 languages open and unlocked without consuming credits on dolly_pro', async () => {
      subscriptions.assertSubscriptionActive.mockResolvedValue(SUBSCRIPTION_PLANS.dolly_pro);
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
      mockSettingsRow({
        selectedLanguages: ['en'],
        lastLanguageChangeAt: twoDaysAgo,
        languageChangeCredits: 1,
      });

      const updated = await service.setLanguages(42, ['fr', 'it']);
      expect(updated.selected).toEqual(['fr', 'it']);
      expect(updated.active).toEqual(['fr', 'it', 'es', 'en']);
      expect(updated.canChangeFree).toBe(true);
      expect(updated.nextFreeChangeAt).toBeNull();
      expect(updated.languageChangeCredits).toBe(1);
    });
  });

  describe('daily category anti-abuse limit wiring', () => {
    it('enforces CategoryDailyLimitService before calling AI moderation so 429 aborts with 0 moderation calls', async () => {
      const dailyLimitMock = {
        assertAndRecordDailyQuota: jest
          .fn()
          .mockRejectedValueOnce(new AppHttpException(ErrorCode.CATEGORY_DAILY_LIMIT_REACHED)),
      };
      const serviceWithQuota = new SettingsService(
        db as unknown as DrizzleDb,
        moderation as unknown as CategoryModerationService,
        subscriptions as unknown as SubscriptionsService,
        dailyLimitMock as never,
      );

      mockSettingsRow({ preferredCategories: ['Astronomía'] });
      await expect(serviceWithQuota.setCategories(42, ['Tema 21'])).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({ code: ErrorCode.CATEGORY_DAILY_LIMIT_REACHED }),
      });

      expect(dailyLimitMock.assertAndRecordDailyQuota).toHaveBeenCalledWith(
        42,
        ['Tema 21'],
        ['Astronomía'],
      );
      expect(moderation.assertCategoriesAllowed).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });
});
