import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';
import { READING_CATEGORIES } from '../../readings/prompt-generation/catalog.constants';

const CATEGORY_IDS = [...READING_CATEGORIES];

export class UpdateCategoriesDto {
  @ApiProperty({
    type: [String],
    example: ['technology', 'history'],
    description: 'Category ids to persist as the user’s selection; must be unique and non-empty',
    enum: CATEGORY_IDS,
  })
  @IsArray()
  @ArrayMaxSize(CATEGORY_IDS.length)
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(CATEGORY_IDS, { each: true })
  categories!: string[];
}
