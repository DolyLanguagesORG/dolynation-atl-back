import { ContentService } from './content.service';
import type { ReadingsService } from '../readings/readings.service';
import type { SettingsService } from '../settings/settings.service';
import { READING_CATEGORIES } from '../readings/prompt-generation';

describe('ContentService', () => {
  let service: ContentService;
  let readings: jest.Mocked<Pick<ReadingsService, 'generate'>>;
  let settings: jest.Mocked<Pick<SettingsService, 'getCategories'>>;

  beforeEach(() => {
    readings = { generate: jest.fn().mockResolvedValue({ id: 1 }) };
    settings = { getCategories: jest.fn().mockResolvedValue([]) };
    service = new ContentService(
      readings as unknown as ReadingsService,
      settings as unknown as SettingsService,
    );
  });

  describe('resolveCategory', () => {
    it('returns the explicit category when provided', async () => {
      await expect(service.resolveCategory(42, 'history')).resolves.toBe('history');
    });

    it('prefers user saved dynamic categories before falling back to catalog', async () => {
      settings.getCategories.mockResolvedValue(['Astronomía Observacional']);
      await expect(service.resolveCategory(42)).resolves.toBe('Astronomía Observacional');
    });

    it('falls back to a value from the catalog when user has no saved categories', async () => {
      const result = await service.resolveCategory(42);
      expect(READING_CATEGORIES).toContain(result);
    });
  });

  describe('generate', () => {
    it('forwards explicit language and resolved options to readings.generate', async () => {
      await service.generate(42, { category: 'technology', difficulty: 'hard', language: 'fr' });
      expect(readings.generate).toHaveBeenCalledWith({
        userId: 42,
        options: { category: 'technology', difficulty: 'hard', language: 'fr' },
      });
    });

    it('omits undefined difficulty and size while forwarding language', async () => {
      await service.generate(42, { category: 'technology', language: 'it' });
      expect(readings.generate).toHaveBeenCalledWith({
        userId: 42,
        options: { category: 'technology', language: 'it' },
      });
    });
  });
});
