import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * Query DTO para eliminar una categoría de la biblioteca personal del usuario.
 */
export class DeleteCategoryQueryDto {
  @ApiProperty({
    example: 'Astronomía',
    description:
      'Nombre o identificador de la categoría que el usuario desea eliminar de su perfil',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  category!: string;
}
