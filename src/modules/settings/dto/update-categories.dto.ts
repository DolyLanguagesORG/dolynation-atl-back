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

/**
 * DTO de entrada para actualizar las categorías preferidas del usuario.
 */
export class UpdateCategoriesDto {
  @ApiProperty({
    type: [String],
    example: ['technology', 'history', 'quantum physics'],
    description:
      'Nombres o IDs de categorías a guardar como selección del usuario; deben ser únicos y no vacíos (2-50 caracteres cada uno)',
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
