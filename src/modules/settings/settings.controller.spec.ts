import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { LanguagesSettingsDto } from './dto/settings-catalog.dto';

describe('SettingsController', () => {
  let controller: SettingsController;
  let settings: jest.Mocked<
    Pick<
      SettingsService,
      | 'getCategories'
      | 'setCategories'
      | 'getLanguagesSettings'
      | 'setLanguages'
      | 'reorderLanguages'
      | 'unlockLanguageChange'
    >
  >;
  let subscriptions: {
    assertSubscriptionActive: jest.Mock;
    assertCategoryLimit: jest.Mock;
  };
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };

  const languageState: LanguagesSettingsDto = {
    catalog: [
      { id: 'es', name: 'Español' },
      { id: 'en', name: 'English' },
      { id: 'fr', name: 'Français' },
      { id: 'it', name: 'Italiano' },
    ],
    selected: ['es', 'fr'],
    active: ['es', 'fr'],
    maxLanguages: 2,
    canChangeFree: false,
    nextFreeChangeAt: '2027-11-12T00:00:00.000Z',
    lastLanguageChangeAt: '2026-11-12T00:00:00.000Z',
    languageChangeCredits: 0,
  };

  beforeEach(async () => {
    settings = {
      getCategories: jest.fn().mockResolvedValue([]),
      setCategories: jest.fn().mockImplementation((_: number, c: string[]) => Promise.resolve(c)),
      getLanguagesSettings: jest.fn().mockResolvedValue(languageState),
      setLanguages: jest.fn().mockResolvedValue(languageState),
      reorderLanguages: jest
        .fn()
        .mockResolvedValue({ ...languageState, selected: ['fr', 'es'], active: ['fr', 'es'] }),
      unlockLanguageChange: jest
        .fn()
        .mockResolvedValue({ ...languageState, languageChangeCredits: 1 }),
    };

    subscriptions = {
      assertSubscriptionActive: jest.fn().mockResolvedValue(undefined),
      assertCategoryLimit: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: settings },
        { provide: SubscriptionsService, useValue: subscriptions },
      ],
    }).compile();

    controller = moduleRef.get(SettingsController);
  });

  describe('GET /settings/categories', () => {
    it('returns the catalog and the current selection', async () => {
      settings.getCategories.mockResolvedValue(['technology']);
      const result = await controller.getCategories(user);
      expect(result.data.selected).toEqual(['technology']);
      expect(result.data.catalog.length).toBeGreaterThan(0);
      expect(settings.getCategories).toHaveBeenCalledWith(42);
    });
  });

  describe('PUT /settings/categories', () => {
    it('persists the user’s selection when at least 3 unique categories are provided', async () => {
      const result = await controller.updateCategories(user, {
        categories: ['technology', 'history', 'science'],
      });
      expect(result.data.selected).toEqual(['technology', 'history', 'science']);
      expect(settings.setCategories).toHaveBeenCalledWith(42, ['technology', 'history', 'science']);
    });

    it('rejects duplicate-collapsed arrays with fewer than 3 unique categories', async () => {
      await expect(
        controller.updateCategories(user, {
          categories: ['  Technology  ', 'technology', 'TECHNOlogy'],
        }),
      ).rejects.toMatchObject({
        status: 400,
      });
      expect(subscriptions.assertCategoryLimit).not.toHaveBeenCalled();
      expect(settings.setCategories).not.toHaveBeenCalled();
    });

    it('normalizes whitespace and deduplicates case/accent variants before enforcing limit and saving', async () => {
      const result = await controller.updateCategories(user, {
        categories: [
          '  Technology  ',
          'technology',
          'Música Clásica',
          'musica   clasica',
          'history',
        ],
      });

      expect(subscriptions.assertCategoryLimit).toHaveBeenCalledWith(42, 3);
      expect(settings.setCategories).toHaveBeenCalledWith(42, [
        'technology',
        'Música Clásica',
        'history',
      ]);
      expect(result.data.selected).toEqual(['technology', 'Música Clásica', 'history']);
    });
  });

  describe('GET /settings/languages', () => {
    it('returns the 4-language catalog and user language state', async () => {
      const result = await controller.getLanguages(user);
      expect(result.data.selected).toEqual(['es', 'fr']);
      expect(result.data.catalog.map((l) => l.id)).toEqual(['es', 'en', 'fr', 'it']);
      expect(settings.getLanguagesSettings).toHaveBeenCalledWith(42);
    });
  });

  describe('PUT /settings/languages', () => {
    it('delegates language selection persistence to settingsService', async () => {
      const result = await controller.updateLanguages(user, { languages: ['es', 'fr'] });
      expect(settings.setLanguages).toHaveBeenCalledWith(42, ['es', 'fr']);
      expect(result.data.active).toEqual(['es', 'fr']);
    });
  });

  describe('PUT /settings/languages/reorder', () => {
    it('reorders user languages priority list', async () => {
      const result = await controller.reorderLanguages(user, { languages: ['fr', 'es'] });
      expect(settings.reorderLanguages).toHaveBeenCalledWith(42, ['fr', 'es']);
      expect(result.data.selected).toEqual(['fr', 'es']);
    });
  });

  describe('POST /settings/languages/unlock-change', () => {
    it('records a manual unlock payment and increments languageChangeCredits', async () => {
      const result = await controller.unlockLanguageChange(user);
      expect(settings.unlockLanguageChange).toHaveBeenCalledWith(42);
      expect(result.data.languageChangeCredits).toBe(1);
    });
  });
});
