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

/**
 * DTO con un fallo registrado del proveedor de IA, para que el equipo pueda
 * diagnosticar **sin entrar al servidor**.
 *
 * La tabla `prompt_logs` guarda el error real (el 429 de Google, un timeout,
 * un JSON que no parsea) que el filtro de errores de la API descarta para no
 * filtrar internals al cliente final. Aqui solo lo ve un administrador.
 */
export class AdminPromptLogDto {
  @ApiProperty({ example: 128, description: 'Identificador del registro' })
  id!: number;

  @ApiProperty({ example: 'error', description: 'Nivel del registro (error | warn | info)' })
  level!: string;

  @ApiProperty({
    example: 'text_generation_failed',
    description: 'Evento que se produjo (por ejemplo, text_generation_failed)',
  })
  event!: string;

  @ApiProperty({
    example: 'Google request failed: 429 Too Many Requests - quota exceeded',
    nullable: true,
    description: 'Error original del proveedor, sin filtrar',
  })
  errorMessage!: string | null;

  @ApiProperty({
    example: 'AI provider exhausted retries: ...',
    nullable: true,
    description: 'Mensaje del registro',
  })
  message!: string | null;

  @ApiProperty({ example: 42, nullable: true, description: 'Usuario afectado' })
  userId!: number | null;

  @ApiProperty({
    example: '2026-11-16T10:00:00.000Z',
    description: 'Momento del registro',
  })
  createdAt!: Date;
}
