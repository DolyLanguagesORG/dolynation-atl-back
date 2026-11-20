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
  let selectOrderBy: jest.Mock;
  let updateSet: jest.Mock;
  let updateReturning: jest.Mock;
  let db: { insert: jest.Mock; select: jest.Mock; update: jest.Mock };
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
    selectOrderBy = jest.fn().mockReturnValue({ limit: selectLimit });
    // `where()` devuelve un objeto con `limit` (findByUserId) y con
    // `orderBy` (getGlobalCatalog): las dos consultas encadenan distinto.
    const selectWhereResult = { limit: selectLimit, orderBy: selectOrderBy };
    // El incremento del credito de idioma es un UPDATE atomico
    // (`credits = credits + 1`), no un insert con el valor calculado en el
    // proceso: asi dos compras simultaneas no se pisan.
    updateReturning = jest.fn().mockResolvedValue([{ userId: 42 }]);
    updateSet = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ returning: updateReturning }),
    });
    db = {
      insert: jest.fn().mockReturnValue({ values }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(selectWhereResult),
        }),
      }),
      update: jest.fn().mockReturnValue({ set: updateSet }),
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
    it('rejects fewer than 3 categories with VALIDATION_ERROR before moderation or quota', async () => {
      await expect(service.setCategories(42, ['technology', 'history'])).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      });
      expect(moderation.assertCategoriesAllowed).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('moderates, normalizes, persists and returns allowed categories', async () => {
      moderation.assertCategoriesAllowed.mockResolvedValueOnce([
        'technology',
        'history',
        'Día de Muertos',
      ]);

      const result = await service.setCategories(42, [
        '  Technology ',
        'history',
        'Día de Muertos',
      ]);

      expect(moderation.assertCategoriesAllowed).toHaveBeenCalledWith([
        '  Technology ',
        'history',
        'Día de Muertos',
      ]);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          preferredCategories: ['technology', 'history', 'Día de Muertos'],
        }),
      );
      expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['technology', 'history', 'Día de Muertos']);
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
        await service.setCategories(42, ['technology', 'history', 'm u e r t o']);
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
      await expect(
        serviceWithQuota.setCategories(42, ['technology', 'history', 'Tema 21']),
      ).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({ code: ErrorCode.CATEGORY_DAILY_LIMIT_REACHED }),
      });

      expect(dailyLimitMock.assertAndRecordDailyQuota).toHaveBeenCalledWith(
        42,
        ['technology', 'history', 'Tema 21'],
        ['Astronomía'],
      );
      expect(moderation.assertCategoriesAllowed).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('getCategoriesSettings & personal category library (toggle/delete)', () => {
    it('returns empty private catalog and selection for a new user without leaking global categories', async () => {
      mockSettingsRow(null);

      await expect(service.getCategoriesSettings(42)).resolves.toEqual({
        catalog: [],
        selected: [],
      });
    });

    it('preserves deselected user categories in savedCategories while keeping only active ones in selected', async () => {
      mockSettingsRow({
        preferredCategories: ['Gatos', 'Historia', 'Ciencia', 'Cocina'],
        savedCategories: ['Gatos', 'Historia', 'Ciencia', 'Cocina'],
      });
      moderation.assertCategoriesAllowed.mockResolvedValueOnce(['Gatos', 'Historia', 'Ciencia']);

      const result = await service.setCategories(42, ['Gatos', 'Historia', 'Ciencia']);

      expect(result).toEqual(['Gatos', 'Historia', 'Ciencia']);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          preferredCategories: ['Gatos', 'Historia', 'Ciencia'],
          savedCategories: ['Gatos', 'Historia', 'Ciencia', 'Cocina'],
        }),
      );

      mockSettingsRow({
        preferredCategories: ['Gatos', 'Historia', 'Ciencia'],
        savedCategories: ['Gatos', 'Historia', 'Ciencia', 'Cocina'],
      });
      const settingsDto = await service.getCategoriesSettings(42);
      expect(settingsDto).toEqual({
        catalog: [
          { id: 'Gatos', name: 'Gatos' },
          { id: 'Historia', name: 'Historia' },
          { id: 'Ciencia', name: 'Ciencia' },
          { id: 'Cocina', name: 'Cocina' },
        ],
        selected: ['Gatos', 'Historia', 'Ciencia'],
      });
    });

    it('releases acquired daily quota keys when moderation fails closed with 503', async () => {
      const dailyLimitMock = {
        acquireDailyQuota: jest.fn().mockResolvedValueOnce(['astronomia']),
        releaseDailyQuotaKeys: jest.fn().mockResolvedValueOnce(undefined),
      };
      const serviceWithQuota = new SettingsService(
        db as unknown as DrizzleDb,
        moderation as unknown as CategoryModerationService,
        subscriptions as unknown as SubscriptionsService,
        dailyLimitMock as never,
      );
      mockSettingsRow({
        preferredCategories: ['Gatos', 'Historia', 'Ciencia'],
        savedCategories: ['Gatos', 'Historia', 'Ciencia'],
      });
      moderation.assertCategoriesAllowed.mockRejectedValueOnce(
        new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE),
      );

      await expect(
        serviceWithQuota.setCategories(42, ['Gatos', 'Historia', 'Astronomía']),
      ).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: ErrorCode.SERVICE_UNAVAILABLE }),
      });

      expect(dailyLimitMock.releaseDailyQuotaKeys).toHaveBeenCalledWith(42, ['astronomia']);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('removes a deselected or extra category from the user profile without dropping below 3 active', async () => {
      mockSettingsRow({
        preferredCategories: ['Gatos', 'Historia', 'Ciencia'],
        savedCategories: ['Gatos', 'Historia', 'Ciencia', 'Cocina'],
      });

      const afterDeleteDeselected = await service.removeCategory(42, 'cocina');
      expect(afterDeleteDeselected).toEqual({
        catalog: [
          { id: 'Gatos', name: 'Gatos' },
          { id: 'Historia', name: 'Historia' },
          { id: 'Ciencia', name: 'Ciencia' },
        ],
        selected: ['Gatos', 'Historia', 'Ciencia'],
      });

      // Removing one of the last 3 active categories is blocked with VALIDATION_ERROR
      mockSettingsRow({
        preferredCategories: ['Gatos', 'Historia', 'Ciencia'],
        savedCategories: ['Gatos', 'Historia', 'Ciencia'],
      });
      await expect(service.removeCategory(42, 'Gatos')).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      });

      // Unknown category returns RESOURCE_NOT_FOUND
      await expect(service.removeCategory(42, 'NoExiste')).rejects.toMatchObject({
        status: 404,
        response: expect.objectContaining({ code: ErrorCode.RESOURCE_NOT_FOUND }),
      });
    });
  });

  describe('stripe billing mode', () => {
    it('blocks direct unlockLanguageChange with 402 BILLING_PAYMENT_REQUIRED when BILLING_PROVIDER=stripe', async () => {
      const stripeSettings = new SettingsService(
        db as unknown as DrizzleDb,
        moderation as unknown as CategoryModerationService,
        subscriptions as unknown as SubscriptionsService,
        undefined,
        {
          billing: { provider: 'stripe' },
          accessRequests: { enabled: false },
        } as never,
      );

      await expect(stripeSettings.unlockLanguageChange(42)).rejects.toMatchObject({
        status: 402,
        response: expect.objectContaining({ code: ErrorCode.BILLING_PAYMENT_REQUIRED }),
      });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('grantLanguageChangeCredit increments language_change_credits atomically and supports optional tx', async () => {
      mockSettingsRow({
        selectedLanguages: ['en', 'fr'],
        lastLanguageChangeAt: new Date('2026-10-01T00:00:00Z'),
        languageChangeCredits: 2,
      });

      const result = await service.grantLanguageChangeCredit(42);

      expect(result.previousCredits).toBe(2);
      expect(result.nextCredits).toBe(3);
      expect(result.saved).toEqual(['en', 'fr']);

      // El incremento se pide a la base (`credits = credits + 1`), no se
      // calcula en el proceso: dos compras simultaneas no pueden pisarse.
      expect(db.update).toHaveBeenCalledTimes(1);
      expect(updateSet).toHaveBeenCalledTimes(1);
      const patch = updateSet.mock.calls[0][0] as Record<string, unknown>;
      expect(patch).toHaveProperty('languageChangeCredits');
      // No es un numero: es la expresion SQL del incremento.
      expect(typeof patch.languageChangeCredits).not.toBe('number');
      // La fila ya existia, asi que no hace falta insertar.
      expect(db.insert).not.toHaveBeenCalled();
    });
  });
});
