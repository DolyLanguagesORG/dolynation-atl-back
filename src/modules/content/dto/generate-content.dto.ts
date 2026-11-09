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
 * Request body for POST /content/generate. All fields are optional:
 * missing values fall back to the user's saved preferences (from
 * /settings/categories), and ultimately to the system defaults.
 */
export class GenerateContentDto {
  @ApiPropertyOptional({
    description:
      'Topic category for the generated reading. If omitted, a category from the ' +
      'user’s saved preferences is used (or picked at random when none is saved).',
    enum: READING_CATEGORIES,
    example: 'technology',
  })
  @IsOptional()
  @IsString()
  @IsIn(READING_CATEGORIES as readonly string[])
  category?: CategoryId;

  @ApiPropertyOptional({
    description: 'Target English level. Defaults to `medium` (B1-B2).',
    enum: READING_DIFFICULTIES,
    example: 'medium',
  })
  @IsOptional()
  @IsIn(READING_DIFFICULTIES as readonly string[])
  difficulty?: DifficultyLevel;

  @ApiPropertyOptional({
    description: 'Reading length. Defaults to `medium`.',
    enum: READING_TEXT_SIZES,
    example: 'medium',
  })
  @IsOptional()
  @IsIn(READING_TEXT_SIZES as readonly string[])
  size?: TextSize;
}
