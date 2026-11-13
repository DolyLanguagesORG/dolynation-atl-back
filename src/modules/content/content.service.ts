import { Injectable } from '@nestjs/common';
import { ReadingsService } from '../readings/readings.service';
import { READING_CATEGORIES } from '../readings/prompt-generation';
import { SettingsService } from '../settings/settings.service';
import type { Reading } from '../../database/drizzle/types';
import type { GenerateContentDto } from './dto/generate-content.dto';

/**
 * Servicio de orquestación para la generación de lecturas bajo demanda (`/content`).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly readings: ReadingsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Resuelve la categoría que se enviará al generador de lecturas.
   *
   * Toma el valor explícito del DTO, o si se omite, elige una de las preferencias configuradas
   * por el usuario en `/settings/categories` (y solo cae al catálogo base si aún no tiene ninguna).
   */
  async resolveCategory(userId: number, requested?: string): Promise<string> {
    if (requested && requested.trim().length > 0) {
      return requested.trim();
    }
    const preferred = await this.settings.getCategories(userId);
    if (preferred.length > 0) {
      return pickRandom(preferred);
    }
    return pickRandom(READING_CATEGORIES);
  }

  /**
   * Genera y persiste una lectura para el usuario aplicando los valores por defecto cuando corresponda.
   */
  async generate(userId: number, dto: GenerateContentDto): Promise<Reading> {
    const category = await this.resolveCategory(userId, dto.category);
    return this.readings.generate({
      userId,
      options: {
        category,
        language: dto.language,
        ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
        ...(dto.size !== undefined ? { size: dto.size } : {}),
      },
    });
  }
}

/** Selecciona un elemento aleatorio de un arreglo no vacío. */
function pickRandom<T>(items: readonly T[]): T {
  const idx = Math.floor(Math.random() * items.length);
  const picked = items[idx];
  if (picked === undefined) throw new Error('pickRandom called on empty array');
  return picked;
}
