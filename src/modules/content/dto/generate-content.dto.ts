import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { SUPPORTED_LANGUAGE_IDS, type LanguageId } from '../../settings/settings.constants';
import { READING_DIFFICULTIES, READING_TEXT_SIZES } from '../../readings/prompt-generation';
import type { DifficultyLevel, TextSize } from '../../readings/prompt-generation/catalog.types';

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
      'Categoría temática de la lectura generada (predefinida o personalizada configurada en `/settings/categories`). Si se omite, se selecciona una de las preferencias guardadas del usuario.',
    example: 'technology',
  })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  category?: string;

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
