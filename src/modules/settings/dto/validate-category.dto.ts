import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/**
 * DTO de entrada para validar y moderar una categoría personalizada antes de guardarla en bloque.
 */
export class ValidateCategoryDto {
  @ApiProperty({
    example: 'Astrofísica',
    minLength: 2,
    maxLength: 50,
    description: 'Nombre de la categoría temática a validar y moderar inmediatamente',
  })
  @IsString()
  @Length(2, 50)
  category!: string;
}

/**
 * Respuesta tras validar y normalizar una categoría individual.
 */
export class ValidatedCategoryResponseDto {
  @ApiProperty({
    example: 'Astrofísica',
    description: 'Nombre normalizado de la categoría aprobada',
  })
  category!: string;
}
