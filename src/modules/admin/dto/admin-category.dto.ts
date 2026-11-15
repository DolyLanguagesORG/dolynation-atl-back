import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO que representa una categoría global con sus subcategorías para el panel de administración.
 */
export class AdminCategoryDto {
  @ApiProperty({ example: 'technology', description: 'Identificador estable de la categoría' })
  id!: string;

  @ApiProperty({ example: 'Technology', description: 'Nombre legible para humanos' })
  name!: string;

  @ApiProperty({
    type: [String],
    example: ['AI', 'Robotics'],
    description: 'Nombres de las subcategorías configuradas para esta categoría',
  })
  subcategories!: string[];
}

/**
 * DTO con la información resumida de un usuario para supervisión administrativa.
 */
export class AdminUserRowDto {
  @ApiProperty({ example: 42, description: 'Identificador único del usuario' })
  id!: number;

  @ApiProperty({ example: 'user@example.com', description: 'Correo electrónico del usuario' })
  email!: string;

  @ApiProperty({
    example: 'Jane Doe',
    nullable: true,
    description: 'Nombre completo del usuario o nulo si no está configurado',
  })
  fullName!: string | null;

  @ApiProperty({
    example: '2026-10-18T00:00:00.000Z',
    description: 'Fecha de creación de la cuenta',
  })
  createdAt!: Date;
}
