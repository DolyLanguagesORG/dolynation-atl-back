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
 * Respuesta con el catálogo de idiomas soportados y el seleccionado por el usuario.
 */
export class LanguagesSettingsDto {
  @ApiProperty({
    type: [CatalogItemDto],
    description: 'Todos los idiomas ofrecidos por el catálogo',
  })
  catalog!: CatalogItemDto[];

  @ApiProperty({
    example: 'en',
    description: 'Identificador de idioma seleccionado actualmente por el usuario',
  })
  selected!: string;
}
