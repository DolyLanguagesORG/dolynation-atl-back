import { ApiProperty } from '@nestjs/swagger';

export class AdminCategoryDto {
  @ApiProperty({ example: 'technology', description: 'Stable category identifier' })
  id!: string;

  @ApiProperty({ example: 'Technology', description: 'Human-readable name' })
  name!: string;

  @ApiProperty({
    type: [String],
    example: ['AI', 'Robotics'],
    description: 'Subcategory names configured for this category',
  })
  subcategories!: string[];
}

export class AdminUserRowDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe', nullable: true })
  fullName!: string | null;

  @ApiProperty({ example: '2026-10-18T00:00:00.000Z' })
  createdAt!: Date;
}
