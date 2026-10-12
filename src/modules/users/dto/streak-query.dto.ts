import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class StreakQueryDto {
  @ApiProperty({ minimum: 1, maximum: 365, default: 7, description: 'Window size in days' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}
