import { Injectable } from '@nestjs/common';
import { ReadingsService } from '../readings/readings.service';
import { READING_CATEGORIES } from '../readings/prompt-generation';
import type { CategoryId } from '../readings/prompt-generation/catalog.types';
import type { Reading } from '../../database/drizzle/types';
import type { GenerateContentDto } from './dto/generate-content.dto';

/**
 * Servicio de orquestación para la generación de lecturas bajo demanda (`/content`).
 */
@Injectable()
export class ContentService {
  constructor(private readonly readings: ReadingsService) {}

  /**
   * Resuelve la categoría que se enviará al generador de lecturas.
   *
   * Actualmente toma el valor explícito del DTO o selecciona una categoría aleatoria del catálogo.
   * Como seguimiento posterior consultará las preferencias guardadas en el módulo de ajustes antes
   * de usar una selección aleatoria.
   */
  resolveCategory(requested?: CategoryId): CategoryId {
    if (requested) return requested;
    return pickRandom(READING_CATEGORIES);
  }

  /**
   * Genera y persiste una lectura para el usuario aplicando los valores por defecto cuando corresponda.
   */
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

/** Selecciona un elemento aleatorio de un arreglo no vacío. */
function pickRandom<T>(items: readonly T[]): T {
  const idx = Math.floor(Math.random() * items.length);
  const picked = items[idx];
  if (picked === undefined) throw new Error('pickRandom called on empty array');
  return picked;
}
