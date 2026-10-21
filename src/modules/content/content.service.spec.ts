import { ContentService } from './content.service';
import type { ReadingsService } from '../readings/readings.service';
import { READING_CATEGORIES } from '../readings/prompt-generation';

describe('ContentService', () => {
  let service: ContentService;
  let readings: jest.Mocked<Pick<ReadingsService, 'generate'>>;

  beforeEach(() => {
    readings = { generate: jest.fn().mockResolvedValue({ id: 1 }) };
    service = new ContentService(readings as unknown as ReadingsService);
  });

  describe('resolveCategory', () => {
    it('returns the explicit category when provided', () => {
      expect(service.resolveCategory('history')).toBe('history');
    });

    it('falls back to a value from the catalog when none provided', () => {
      const result = service.resolveCategory();
      expect(READING_CATEGORIES).toContain(result);
    });
  });

  describe('generate', () => {
    it('forwards resolved options to readings.generate', async () => {
      await service.generate(42, { category: 'technology', difficulty: 'hard' });
      expect(readings.generate).toHaveBeenCalledWith({
        userId: 42,
        options: { category: 'technology', difficulty: 'hard' },
      });
    });

    it('omits undefined difficulty and size', async () => {
      await service.generate(42, { category: 'technology' });
      expect(readings.generate).toHaveBeenCalledWith({
        userId: 42,
        options: { category: 'technology' },
      });
    });
  });
});
