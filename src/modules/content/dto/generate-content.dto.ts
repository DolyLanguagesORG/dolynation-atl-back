import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_LANGUAGE_IDS, type LanguageId } from '../../settings/settings.constants';
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

const LANGUAGE_IDS = [...SUPPORTED_LANGUAGE_IDS];

/**
 * Cuerpo de la petición `POST /content/generate`. `language` es obligatorio y debe coincidir
 * con un idioma activo en la selección del usuario; el resto de parámetros son opcionales.
 */
export class GenerateContentDto {
  @ApiProperty({
    description:
      'Target language for the generated reading (es, en, fr, it). Required; must be active in your configured languages and allowed by your subscription plan.',
    enum: LANGUAGE_IDS,
    example: 'es',
  })
  @IsString()
  @IsIn(LANGUAGE_IDS)
  language!: LanguageId;
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
