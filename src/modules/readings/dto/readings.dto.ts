import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
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
 * DTO de entrada para solicitar la explicación contextual de una palabra u oración dentro de una lectura.
 */
export class CreateExplanationDto {
  @ApiProperty({
    description: 'Word, expression, or sentence selected inside the reading to explain',
    example: 'que me parta un rayo',
  })
  @IsString()
  @Length(1, 500)
  word!: string;

  @ApiProperty({
    required: false,
    description: 'Optional surrounding excerpt from the reading used to disambiguate meaning',
    example: 'Juan miró la tormenta y dijo que me parta un rayo si vuelve a olvidar el paraguas.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  context?: string;

  @ApiProperty({
    required: false,
    description:
      'When true, bypasses the cached explanation for this reading and regenerates via AI',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;
}

/**
 * Parámetros de consulta para filtrar las entradas del glosario del usuario.
 */
export class GlossaryQueryDto {
  @ApiProperty({
    required: false,
    enum: ['word', 'phrase'],
    description: 'Filter by entry type (single word vs. sentence/phrase)',
    example: 'phrase',
  })
  @IsOptional()
  @IsIn(['word', 'phrase'])
  entryType?: 'word' | 'phrase';

  @ApiProperty({
    required: false,
    enum: LANGUAGE_IDS,
    description: 'Filter entries by target language code',
    example: 'es',
  })
  @IsOptional()
  @IsIn(LANGUAGE_IDS)
  language?: LanguageId;

  @ApiProperty({
    required: false,
    description: 'When true, returns only entries bookmarked/saved in the user glossary',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  savedOnly?: boolean;

  @ApiProperty({
    required: false,
    description: 'Filter consultations belonging to a specific reading id',
    example: 42,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readingId?: number;

  @ApiProperty({
    required: false,
    description: 'Case-insensitive text filter matched against word, explanation, or context',
    example: 'rayo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

/**
 * DTO de entrada para marcar o desmarcar una explicación en el glosario personal.
 */
export class ToggleGlossarySaveDto {
  @ApiProperty({
    description: 'Target bookmark state in the user personal glossary',
    example: true,
  })
  @IsBoolean()
  isSaved!: boolean;
}

export { READING_CATEGORIES, READING_DIFFICULTIES, READING_TEXT_SIZES, READING_CEFR_LEVELS };
