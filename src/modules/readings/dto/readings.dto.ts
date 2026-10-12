import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import {
  CEFR_BY_DIFFICULTY,
  READING_CATEGORIES,
  READING_CEFR_LEVELS,
  READING_DIFFICULTIES,
  READING_TEXT_SIZES,
} from '../prompt-generation';
import type {
  CategoryId,
  CefrLevel,
  DifficultyLevel,
  TextSize,
} from '../prompt-generation/catalog.types';

/**
 * GenerateReadingDto is the client-facing input for the readings endpoint.
 *
 * The user explicitly chooses three things:
 *   - category  : which topic sub-area to write about
 *   - difficulty: which target English level + CEFR mapping (A1-A2 / B1-B2 / C1-C2)
 *   - size      : how long the reading should be (80-120, 150-220, or 250-350 words)
 *
 * The system fills in subcategory, content type, perspective, and unique
 * focus element so every reading comes out at a non-trivial angle and the
 * LLM doesn't get stale responses.
 */
export class GenerateReadingDto {
  @ApiProperty({
    description: 'Topic category for the generated reading. **Required.**',
    enum: READING_CATEGORIES,
    example: 'technology',
  })
  @IsString()
  @IsIn(READING_CATEGORIES as readonly string[])
  category!: CategoryId;

  @ApiProperty({
    description:
      'Target English level — drives both the vocabulary and grammar ' +
      'guidelines in the LLM prompt. Defaults to `medium` ' +
      '(B1-B2, intermediate).',
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
      'How long the reading should be. `short` (~1 min), `medium` (~2 min), ' +
      'or `long` (~3 min). Defaults to `medium`.',
    enum: READING_TEXT_SIZES,
    default: 'medium',
    example: 'medium',
    required: false,
  })
  @IsOptional()
  @IsIn(READING_TEXT_SIZES as readonly string[])
  size?: TextSize;

  /** Lookup kept around for /readings/options; not exposed in the API. */
  static cefrLevelsForDifficulty(difficulty: DifficultyLevel): readonly CefrLevel[] {
    return CEFR_BY_DIFFICULTY[difficulty];
  }
}

export class EvaluateReadingDto {
  @ApiProperty({
    minLength: 20,
    description: 'The user’s summary of the reading. Must be at least 20 chars.',
    example:
      'The reading was about the Industrial Revolution and how steam engines changed manufacturing.',
  })
  @IsString()
  @Length(20)
  userResponse!: string;
}

export class CreateExplanationDto {
  @ApiProperty({ description: 'Word to explain', example: 'ubiquitous' })
  @IsString()
  word!: string;

  @ApiProperty({
    required: false,
    description: 'Optional sentence where the word appears, for disambiguation',
    example: 'Smartphones have become ubiquitous in modern life.',
  })
  @IsOptional()
  @IsString()
  context?: string;
}

export { READING_CATEGORIES, READING_DIFFICULTIES, READING_TEXT_SIZES, READING_CEFR_LEVELS };
