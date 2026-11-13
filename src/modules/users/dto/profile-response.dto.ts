import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO con los datos públicos del perfil del usuario autenticado.
 */
export class ProfileResponseDto {
  @ApiProperty({ example: 42, description: 'Identificador único del usuario' })
  id!: number;

  @ApiProperty({ example: 'user@example.com', description: 'Correo electrónico de la cuenta' })
  email!: string;

  @ApiProperty({
    example: 'Jane Doe',
    nullable: true,
    description: 'Nombre visible mostrado en la interfaz; puede ser nulo en cuentas heredadas',
  })
  fullName!: string | null;

  @ApiProperty({
    example: 'dolly',
    nullable: true,
    description: 'Nivel de suscripción actual (`dolly`, `dolly_plus`, `dolly_pro` o nulo)',
    enum: ['dolly', 'dolly_plus', 'dolly_pro'],
  })
  subscriptionTier!: string | null;

  @ApiProperty({ example: 5, description: 'Días consecutivos con actividad completada' })
  currentStreak!: number;

  @ApiProperty({
    example: '2026-10-18',
    nullable: true,
    description: 'Fecha ISO (`YYYY-MM-DD`) del último día contabilizado en la racha',
  })
  lastStreakDate!: string | null;

  @ApiProperty({
    example: '2026-10-01T12:34:56.000Z',
    description: 'Marca temporal de creación de la cuenta',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-10-01T12:40:56.000Z',
    format: 'date-time',
    nullable: true,
    description:
      'Momento en que el usuario confirmó su correo. Es nulo mientras la cuenta siga sin verificar',
  })
  emailVerifiedAt!: Date | null;

  @ApiProperty({
    example: 'es',
    enum: ['es', 'en'],
    description:
      'Locale de interfaz del usuario. Determina el idioma de los correos transaccionales',
  })
  locale!: string;

  @ApiProperty({
    type: [String],
    example: ['es', 'en'],
    description:
      'Idiomas activos seleccionados del usuario (ordenados por prioridad y acotados a su suscripción actual) utilizables al generar lecturas',
  })
  selectedLanguages!: string[];
}
