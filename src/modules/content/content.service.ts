import { Injectable } from '@nestjs/common';
import { ReadingsService } from '../readings/readings.service';
import { READING_CATEGORIES } from '../readings/prompt-generation';
import type { CategoryId } from '../readings/prompt-generation/catalog.types';
import type { Reading } from '../../database/drizzle/types';
import type { GenerateContentDto } from './dto/generate-content.dto';

@Injectable()
export class ContentService {
  constructor(private readonly readings: ReadingsService) {}

  /**
   * Resolve the category passed to the readings generator.
   *
   * Today: explicit DTO value, else a random category from the catalog.
   * A follow-up (depends on PR #35 landing) will consult the user's saved
   * preferences from the settings module before falling back to random.
   */
  resolveCategory(requested?: CategoryId): CategoryId {
    if (requested) return requested;
    return pickRandom(READING_CATEGORIES);
  }

  async generate(userId: number, dto: GenerateContentDto): Promise<Reading> {
    const category = this.resolveCategory(dto.category);
    return this.readings.generate({
      userId,
      options: {
        category,
        ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
        ...(dto.size !== undefined ? { size: dto.size } : {}),
      },
    });
  }
}

function pickRandom<T>(items: readonly T[]): T {
  const idx = Math.floor(Math.random() * items.length);
  const picked = items[idx];
  if (picked === undefined) throw new Error('pickRandom called on empty array');
  return picked;
}
