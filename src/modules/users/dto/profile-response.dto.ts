import { ApiProperty } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({ example: 42, description: 'User identifier' })
  id!: number;

  @ApiProperty({ example: 'user@example.com', description: 'Account email' })
  email!: string;

  @ApiProperty({
    example: 'Jane Doe',
    nullable: true,
    description: 'Display name shown in the UI; may be null for legacy accounts',
  })
  fullName!: string | null;

  @ApiProperty({ example: 5, description: 'Consecutive days with completed activity' })
  currentStreak!: number;

  @ApiProperty({
    example: '2026-10-18',
    nullable: true,
    description: 'ISO date (YYYY-MM-DD) of the last day counted into the streak',
  })
  lastStreakDate!: string | null;

  @ApiProperty({
    example: '2026-10-01T12:34:56.000Z',
    description: 'Account creation timestamp',
  })
  createdAt!: Date;
}
