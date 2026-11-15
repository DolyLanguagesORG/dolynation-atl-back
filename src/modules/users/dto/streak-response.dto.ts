import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, Max, Min } from 'class-validator';

/**
 * DTO de respuesta con los indicadores diarios de racha en el periodo consultado.
 */
export class StreakResponseDto {
  @ApiProperty({
    type: [Number],
    description:
      'Arreglo de 1 (día activo) o 0 (día inactivo) por cada día dentro de la ventana solicitada',
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(1, { each: true })
  days!: number[];

  @ApiProperty({ description: 'Cantidad de días incluidos en la respuesta', example: 7 })
  @IsInt()
  count!: number;
}
