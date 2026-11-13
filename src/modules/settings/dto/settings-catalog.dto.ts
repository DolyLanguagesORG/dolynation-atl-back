import { ApiProperty } from '@nestjs/swagger';

/**
 * Elemento genérico de catálogo (categoría o idioma) expuesto por el módulo de ajustes.
 */
export class CatalogItemDto {
  @ApiProperty({ example: 'technology', description: 'Identificador estable' })
  id!: string;

  @ApiProperty({ example: 'Technology', description: 'Nombre legible para humanos' })
  name!: string;
}

/**
 * Respuesta con el catálogo de categorías disponibles y las elegidas por el usuario.
 */
export class CategoriesSettingsDto {
  @ApiProperty({
    type: [CatalogItemDto],
    description: 'Todas las categorías disponibles en el catálogo',
  })
  catalog!: CatalogItemDto[];

  @ApiProperty({
    type: [String],
    example: ['technology', 'history'],
    description: 'Identificadores de categorías seleccionados actualmente por el usuario',
  })
  selected!: string[];
}

/**
 * Respuesta con el catálogo de idiomas soportados, la selección priorizada del usuario y el estado de bloqueo.
 */
export class LanguagesSettingsDto {
  @ApiProperty({
    type: [CatalogItemDto],
    description: 'Todos los idiomas ofrecidos por el catálogo del sistema',
  })
  catalog!: CatalogItemDto[];

  @ApiProperty({
    type: [String],
    example: ['es', 'en'],
    description:
      'Lista ordenada por prioridad de los idiomas configurados (`index 0` = idioma más importante)',
  })
  selected!: string[];

  @ApiProperty({
    type: [String],
    example: ['es', 'en'],
    description:
      'Subconjunto activo de idiomas utilizables en el generador de lecturas según el límite del plan actual',
  })
  active!: string[];

  @ApiProperty({
    example: 2,
    description:
      'Cantidad máxima de idiomas simultáneos permitidos por el plan de suscripción actual (`0` si no tiene plan)',
  })
  maxLanguages!: number;

  @ApiProperty({
    example: false,
    description:
      'Indica si el usuario puede cambiar su selección gratis actualmente (primera elección o tras cumplir 365 días)',
  })
  canChangeFree!: boolean;

  @ApiProperty({
    example: '2027-11-12T23:00:00.000Z',
    nullable: true,
    description:
      'Fecha ISO en la que se habilita el próximo cambio anual gratuito, o nulo si ya se encuentra habilitado',
  })
  nextFreeChangeAt!: string | null;

  @ApiProperty({
    example: '2026-11-12T23:00:00.000Z',
    nullable: true,
    description: 'Fecha ISO de la última selección o cambio de idiomas bloqueado',
  })
  lastLanguageChangeAt!: string | null;

  @ApiProperty({
    example: 0,
    description:
      'Créditos disponibles para realizar un cambio de idioma inmediato antes de cumplir el año',
  })
  languageChangeCredits!: number;
}
