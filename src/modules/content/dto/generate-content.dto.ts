import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  READING_CATEGORIES,
  READING_DIFFICULTIES,
  READING_TEXT_SIZES,
} from '../../readings/prompt-generation';
import type {
  CategoryId,
  DifficultyLevel,
  TextSize,
} from '../../readings/prompt-generation/catalog.types';

/**
 * Cuerpo de la petición `POST /content/generate`. Todos los campos son opcionales:
 * los valores omitidos toman las preferencias guardadas del usuario (`/settings/categories`)
 * y, en última instancia, los valores predeterminados del sistema.
 */
export class GenerateContentDto {
  @ApiPropertyOptional({
    description:
      'Categoría temática de la lectura generada. Si se omite, se utiliza una de las ' +
      'preferencias guardadas del usuario (o una aleatoria si no tiene preferencias).',
    enum: READING_CATEGORIES,
    example: 'technology',
  })
  @IsOptional()
  @IsString()
  @IsIn(READING_CATEGORIES as readonly string[])
  category?: CategoryId;

  @ApiPropertyOptional({
    description: 'Nivel objetivo de inglés. Por defecto `medium` (B1-B2).',
    enum: READING_DIFFICULTIES,
    example: 'medium',
  })
  @IsOptional()
  @IsIn(READING_DIFFICULTIES as readonly string[])
  difficulty?: DifficultyLevel;

  @ApiPropertyOptional({
    description: 'Longitud de la lectura. Por defecto `medium`.',
    enum: READING_TEXT_SIZES,
    example: 'medium',
  })
  @IsOptional()
  @IsIn(READING_TEXT_SIZES as readonly string[])
  size?: TextSize;
}
