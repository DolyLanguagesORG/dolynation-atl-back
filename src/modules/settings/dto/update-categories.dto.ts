import { ApiProperty } from '@nestjs/swagger';
import { MIN_USER_CATEGORIES } from '../settings.constants';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
} from 'class-validator';

/**
 * DTO de entrada para actualizar las categorías preferidas del usuario.
 */
export class UpdateCategoriesDto {
  @ApiProperty({
    type: [String],
    minItems: MIN_USER_CATEGORIES,
    example: ['technology', 'history', 'quantum physics'],
    description:
      'Nombres o IDs de categorías (predefinidas o personalizadas) a guardar como selección del usuario; mínimo 3 únicas y de 2 a 50 caracteres cada una',
  })
  @IsArray()
  @ArrayMinSize(MIN_USER_CATEGORIES)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(2, 50, { each: true })
  categories!: string[];
}
