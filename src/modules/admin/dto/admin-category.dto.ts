import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '../../../common/types/user-role';

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
 * Filtros opcionales de búsqueda por nombre/correo y rol para `GET /admin/users`.
 */
export class AdminUsersQueryDto {
  @ApiPropertyOptional({
    example: 'maria',
    description: 'Optional case-insensitive filter matched against email or full name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    enum: USER_ROLES,
    example: 'student',
    description: 'Optional filter by system role',
  })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;
}

/**
 * DTO con la información resumida de un usuario para supervisión administrativa.
 */
export class AdminUserRowDto {
  @ApiProperty({ example: 42, description: 'Unique user identifier' })
  id!: number;

  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  email!: string;

  @ApiProperty({
    example: 'Jane Doe',
    nullable: true,
    description: 'User full name or null if unset',
  })
  fullName!: string | null;

  @ApiProperty({
    enum: USER_ROLES,
    example: 'student',
    description: 'System role assigned to the user account',
  })
  role!: UserRole;

  @ApiProperty({
    example: 'dolly_plus',
    nullable: true,
    description: 'Current active subscription tier or null when none is active',
  })
  subscriptionTier!: string | null;

  @ApiProperty({
    example: '2026-10-18T00:05:00.000Z',
    nullable: true,
    format: 'date-time',
    description: 'Timestamp when email verification was completed, or null if unverified',
  })
  emailVerifiedAt!: Date | null;

  @ApiProperty({
    example: 'es',
    description: 'Preferred interface locale used for transactional emails',
  })
  locale!: string;

  @ApiProperty({
    example: 1,
    description: 'Number of pending access requests currently awaiting review for this user',
  })
  pendingRequestsCount!: number;

  @ApiProperty({
    example: '2026-10-18T00:00:00.000Z',
    description: 'Account creation timestamp',
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

  @ApiPropertyOptional({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    nullable: true,
    description: 'Identificador único de correlación de la petición HTTP',
  })
  requestId?: string | null;

  @ApiPropertyOptional({
    example: '203.0.113.10',
    nullable: true,
    description: 'Dirección IP de origen de la petición',
  })
  ipAddress?: string | null;

  @ApiPropertyOptional({
    example: 'google',
    nullable: true,
    description: 'Proveedor de IA utilizado',
  })
  provider?: string | null;

  @ApiPropertyOptional({
    example: 'gemini-3.5-flash-lite',
    nullable: true,
    description: 'Modelo de IA utilizado',
  })
  model?: string | null;

  @ApiPropertyOptional({
    example: 1420,
    nullable: true,
    description: 'Duración de la operación en milisegundos',
  })
  durationMs?: number | null;

  @ApiProperty({
    example: '2026-11-16T10:00:00.000Z',
    description: 'Momento del registro',
  })
  createdAt!: Date;
}
