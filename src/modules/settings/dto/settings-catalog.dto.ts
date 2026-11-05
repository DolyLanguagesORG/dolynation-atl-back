import { ApiProperty } from '@nestjs/swagger';

export class CatalogItemDto {
  @ApiProperty({ example: 'technology', description: 'Stable identifier' })
  id!: string;

  @ApiProperty({ example: 'Technology', description: 'Human-readable name' })
  name!: string;
}

export class CategoriesSettingsDto {
  @ApiProperty({ type: [CatalogItemDto], description: 'All categories offered by the catalog' })
  catalog!: CatalogItemDto[];

  @ApiProperty({
    type: [String],
    example: ['technology', 'history'],
    description: 'Category ids currently selected by the user',
  })
  selected!: string[];
}

export class LanguagesSettingsDto {
  @ApiProperty({ type: [CatalogItemDto], description: 'All languages offered by the catalog' })
  catalog!: CatalogItemDto[];

  @ApiProperty({
    example: 'en',
    description: 'Language id currently selected by the user',
  })
  selected!: string;
}
