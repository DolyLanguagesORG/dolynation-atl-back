import { ApiProperty } from '@nestjs/swagger';
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
    example: ['technology', 'history', 'quantum physics'],
    description:
      'Nombres o IDs de categorías (predefinidas o personalizadas) a guardar como selección del usuario; deben ser únicos y de 2 a 50 caracteres cada uno',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(2, 50, { each: true })
  categories!: string[];
}
