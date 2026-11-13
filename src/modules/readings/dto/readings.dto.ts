import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { SUPPORTED_LANGUAGE_IDS, type LanguageId } from '../../settings/settings.constants';
import {
  CEFR_BY_DIFFICULTY,
  READING_CATEGORIES,
  READING_CEFR_LEVELS,
  READING_DIFFICULTIES,
  READING_TEXT_SIZES,
} from '../prompt-generation';
import type { CefrLevel, DifficultyLevel, TextSize } from '../prompt-generation/catalog.types';

const LANGUAGE_IDS = [...SUPPORTED_LANGUAGE_IDS];

/**
 * `GenerateReadingDto` es el DTO de entrada expuesto al cliente para el endpoint de generación de lecturas.
 *
 * El usuario elige explícitamente tres parámetros:
 *   - `category`  : área temática sobre la que se escribirá la lectura
 *   - `difficulty`: nivel objetivo de inglés y mapeo CEFR (`A1-A2` / `B1-B2` / `C1-C2`)
 *   - `size`      : longitud deseada de la lectura (`80-120`, `150-220` o `250-350` palabras)
 *
 * El sistema completa subcategoría, tipo de contenido, perspectiva y foco único
 * para que cada lectura aborde un ángulo distinto y evitar respuestas repetitivas del LLM.
 */
export class GenerateReadingDto {
  @ApiProperty({
    description:
      'Categoría temática de la lectura generada. Debe coincidir con una de las categorías de estudio configuradas por el usuario.',
    enum: READING_CATEGORIES,
    example: 'technology',
  })
  @IsString()
  @Length(2, 50)
  category!: string;

  @ApiProperty({
    description:
      'Nivel objetivo de inglés — guía tanto el vocabulario como las reglas gramaticales ' +
      'del prompt enviado al LLM. Por defecto `medium` (B1-B2, intermedio).',
    enum: READING_DIFFICULTIES,
    default: 'medium',
    example: 'medium',
    required: false,
  })
  @IsOptional()
  @IsIn(READING_DIFFICULTIES as readonly string[])
  difficulty?: DifficultyLevel;

  @ApiProperty({
    description:
      'Longitud deseada de la lectura: `short` (~1 min), `medium` (~2 min) ' +
      'o `long` (~3 min). Por defecto `medium`.',
    enum: READING_TEXT_SIZES,
    default: 'medium',
    example: 'medium',
    required: false,
  })
  @IsOptional()
  @IsIn(READING_TEXT_SIZES as readonly string[])
  size?: TextSize;

  @ApiProperty({
    description:
      'Target language for the generated reading (es, en, fr, it). Required; must be active in your configured languages and allowed by your subscription plan.',
    enum: LANGUAGE_IDS,
    example: 'es',
  })
  @IsString()
  @IsIn(LANGUAGE_IDS)
  language!: LanguageId;

  /** Consulta auxiliar conservada para `/readings/options`; no se expone en el esquema público. */
  static cefrLevelsForDifficulty(difficulty: DifficultyLevel): readonly CefrLevel[] {
    return CEFR_BY_DIFFICULTY[difficulty];
  }
}

/**
 * DTO de entrada para evaluar el resumen escrito por el usuario sobre una lectura.
 */
export class EvaluateReadingDto {
  @ApiProperty({
    minLength: 20,
    description: 'Resumen de la lectura escrito por el usuario. Debe tener al menos 20 caracteres.',
    example:
      'The reading was about the Industrial Revolution and how steam engines changed manufacturing.',
  })
  @IsString()
  @Length(20)
  userResponse!: string;
}

/**
 * DTO de entrada para solicitar la explicación contextual de una palabra dentro de una lectura.
 */
export class CreateExplanationDto {
  @ApiProperty({ description: 'Palabra o expresión a explicar', example: 'ubiquitous' })
  @IsString()
  word!: string;

  @ApiProperty({
    required: false,
    description: 'Oración opcional donde aparece la palabra, útil para desambiguar su significado',
    example: 'Smartphones have become ubiquitous in modern life.',
  })
  @IsOptional()
  @IsString()
  context?: string;
}

export { READING_CATEGORIES, READING_DIFFICULTIES, READING_TEXT_SIZES, READING_CEFR_LEVELS };
