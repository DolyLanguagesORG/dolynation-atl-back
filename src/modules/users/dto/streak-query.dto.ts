import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Parámetros de consulta para obtener el historial de racha reciente del usuario.
 */
export class StreakQueryDto {
  @ApiProperty({
    minimum: 1,
    maximum: 365,
    default: 7,
    description: 'Tamaño de la ventana de consulta en días',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}
