import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, Max, Min } from 'class-validator';

export class StreakResponseDto {
  @ApiProperty({
    type: [Number],
    description: 'Array of 1 (active) or 0 (inactive) per day in the requested window',
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(1, { each: true })
  days!: number[];

  @ApiProperty({ description: 'Number of days in the response', example: 7 })
  @IsInt()
  count!: number;
}
