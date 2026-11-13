import { ApiProperty } from '@nestjs/swagger';

/**
 * Resumen cuantitativo del progreso de lecturas de un usuario.
 */
export class HistoryReadingsSummaryDto {
  @ApiProperty({ example: 12, description: 'Total de lecturas generadas por el usuario' })
  total!: number;

  @ApiProperty({ example: 2, description: 'Lecturas aún pendientes de evaluación' })
  pending!: number;

  @ApiProperty({ example: 10, description: 'Lecturas ya evaluadas' })
  completed!: number;

  @ApiProperty({
    example: 7,
    description: 'Lecturas completadas con calificación aprobatoria',
  })
  passed!: number;

  @ApiProperty({
    example: 83,
    nullable: true,
    description: 'Puntaje promedio entre las lecturas completadas, o nulo si no existen',
  })
  averageScore!: number | null;
}

/**
 * Entrada individual del historial reciente de calificaciones de lecturas.
 */
export class HistoryScoreEntryDto {
  @ApiProperty({ example: 42, description: 'Identificador de la lectura evaluada' })
  readingId!: number;

  @ApiProperty({ example: 'The rise of steam power', description: 'Título de la lectura' })
  title!: string;

  @ApiProperty({
    example: 85,
    nullable: true,
    description: 'Puntaje obtenido en la evaluación o nulo',
  })
  score!: number | null;

  @ApiProperty({
    example: true,
    nullable: true,
    description: 'Indica si la lectura fue aprobada o nulo',
  })
  passed!: boolean | null;

  @ApiProperty({
    example: '2026-10-18T00:00:00.000Z',
    nullable: true,
    description: 'Fecha en la que se realizó la evaluación',
  })
  evaluatedAt!: Date | null;
}

/**
 * DTO principal del resumen de historial de actividad del usuario.
 */
export class HistorySummaryDto {
  @ApiProperty({
    type: HistoryReadingsSummaryDto,
    description: 'Totales y métricas agregadas de lecturas',
  })
  readings!: HistoryReadingsSummaryDto;

  @ApiProperty({
    type: [HistoryScoreEntryDto],
    description: 'Últimas lecturas completadas con su puntaje, de la más reciente a la más antigua',
  })
  recentScores!: HistoryScoreEntryDto[];

  @ApiProperty({
    example: 0,
    description:
      'Palabras consultadas por el usuario. Devuelve 0 hasta que exista la tabla de persistencia de consultas.',
  })
  wordsLookedUp!: number;
}
