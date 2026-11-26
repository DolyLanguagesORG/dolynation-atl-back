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
      | 'getCategoriesSettings'
      | 'setCategories'
      | 'removeCategory'
      | 'validateCategory'
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
      getCategoriesSettings: jest.fn().mockResolvedValue({ catalog: [], selected: [] }),
      setCategories: jest.fn().mockImplementation((_: number, c: string[]) => Promise.resolve(c)),
      removeCategory: jest.fn().mockResolvedValue({ catalog: [], selected: [] }),
      validateCategory: jest
        .fn()
        .mockImplementation((_: number, c: string) => Promise.resolve(c.trim())),
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
    it('returns only the user personal category library and active selection', async () => {
      settings.getCategoriesSettings.mockResolvedValue({
        catalog: [
          { id: 'Astronomía Moderna', name: 'Astronomía Moderna' },
          { id: 'Historia de México', name: 'Historia de México' },
        ],
        selected: ['Astronomía Moderna'],
      });
      const result = await controller.getCategories(user);
      expect(result.data.selected).toEqual(['Astronomía Moderna']);
      expect(result.data.catalog).toEqual([
        { id: 'Astronomía Moderna', name: 'Astronomía Moderna' },
        { id: 'Historia de México', name: 'Historia de México' },
      ]);
      expect(settings.getCategoriesSettings).toHaveBeenCalledWith(42);
    });

    it('returns an empty catalog when the user has not created categories yet', async () => {
      settings.getCategoriesSettings.mockResolvedValue({ catalog: [], selected: [] });
      const result = await controller.getCategories(user);
      expect(result.data.catalog).toEqual([]);
      expect(result.data.selected).toEqual([]);
    });
  });

  describe('PUT /settings/categories', () => {
    it('persists the user’s selection when at least 3 unique categories are provided', async () => {
      settings.getCategoriesSettings.mockResolvedValue({
        catalog: [
          { id: 'technology', name: 'technology' },
          { id: 'history', name: 'history' },
          { id: 'science', name: 'science' },
        ],
        selected: ['technology', 'history', 'science'],
      });
      const result = await controller.updateCategories(user, {
        categories: ['technology', 'history', 'science'],
      });
      expect(result.data.selected).toEqual(['technology', 'history', 'science']);
      expect(result.data.catalog).toHaveLength(3);
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

    it('normalizes whitespace and deduplicates case/accent variants preserving user casing', async () => {
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
        'Technology',
        'Música Clásica',
        'history',
      ]);
      expect(result.data.selected).toEqual(['Technology', 'Música Clásica', 'history']);
      expect(result.data.catalog).toEqual([]);
    });
  });

  describe('DELETE /settings/categories', () => {
    it('deletes a category from the user profile library and returns updated state', async () => {
      settings.removeCategory.mockResolvedValue({
        catalog: [
          { id: 'technology', name: 'technology' },
          { id: 'history', name: 'history' },
          { id: 'science', name: 'science' },
        ],
        selected: ['technology', 'history', 'science'],
      });

      const result = await controller.removeCategory(user, { category: 'music' });

      expect(settings.removeCategory).toHaveBeenCalledWith(42, 'music');
      expect(result.data.catalog).toHaveLength(3);
      expect(result.data.selected).toEqual(['technology', 'history', 'science']);
    });
  });

  describe('POST /settings/categories/validate', () => {
    it('validates and returns a single normalized category immediately', async () => {
      settings.validateCategory.mockResolvedValueOnce('Astrofísica');

      const result = await controller.validateCategory(user, { category: '  Astrofísica  ' });

      expect(settings.validateCategory).toHaveBeenCalledWith(42, '  Astrofísica  ');
      expect(result.data).toEqual({ category: 'Astrofísica' });
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
