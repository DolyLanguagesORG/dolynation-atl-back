import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
describe('SettingsController', () => {
  let controller: SettingsController;
  let settings: jest.Mocked<
    Pick<SettingsService, 'getCategories' | 'getLanguage' | 'setCategories' | 'setLanguage'>
  >;
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };

  beforeEach(async () => {
    settings = {
      getCategories: jest.fn().mockResolvedValue([]),
      getLanguage: jest.fn().mockResolvedValue('en'),
      setCategories: jest.fn().mockImplementation((_: number, c: string[]) => Promise.resolve(c)),
      setLanguage: jest.fn().mockImplementation((_: number, l: string) => Promise.resolve(l)),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: settings }],
    }).compile();

    controller = moduleRef.get(SettingsController);
  });

  describe('GET /settings/categories', () => {
    it('returns the catalog and the current selection', async () => {
      settings.getCategories.mockResolvedValue(['technology']);
      const result = await controller.getCategories(user);
      expect(result.data.selected).toEqual(['technology']);
      expect(result.data.catalog.length).toBeGreaterThan(0);
      expect(result.data.catalog[0]).toHaveProperty('id');
      expect(result.data.catalog[0]).toHaveProperty('name');
      expect(settings.getCategories).toHaveBeenCalledWith(42);
    });
  });

  describe('PUT /settings/categories', () => {
    it('persists the user’s selection', async () => {
      const result = await controller.updateCategories(user, {
        categories: ['technology', 'history'],
      });
      expect(result.data.selected).toEqual(['technology', 'history']);
      expect(settings.setCategories).toHaveBeenCalledWith(42, ['technology', 'history']);
    });
  });

  describe('GET /settings/languages', () => {
    it('returns the catalog and the user’s language', async () => {
      settings.getLanguage.mockResolvedValue('es');
      const result = await controller.getLanguages(user);
      expect(result.data.selected).toBe('es');
      expect(result.data.catalog.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /settings/languages', () => {
    it('persists the user’s language', async () => {
      const result = await controller.updateLanguage(user, { language: 'fr' });
      expect(result.data.selected).toBe('fr');
      expect(settings.setLanguage).toHaveBeenCalledWith(42, 'fr');
    });
  });
});
