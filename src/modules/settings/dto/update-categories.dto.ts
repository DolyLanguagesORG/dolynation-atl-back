import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
} from 'class-validator';
import { READING_CATEGORIES } from '../../readings/prompt-generation/catalog.constants';

const CATEGORY_IDS = [...READING_CATEGORIES];

export class UpdateCategoriesDto {
  @ApiProperty({
    type: [String],
    example: ['technology', 'history', 'quantum physics'],
    description:
      'Category names or IDs to persist as the user’s selection; must be unique and non-empty (2-50 chars each)',
    enum: CATEGORY_IDS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(2, 50, { each: true })
  categories!: string[];
}
