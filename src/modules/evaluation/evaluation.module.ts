import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { ReadingsModule } from '../readings/readings.module';

/**
 * Módulo de evaluación de resúmenes (`/evaluation`).
 * Delega la lógica de evaluación y calificación al módulo de lecturas.
 */
@Module({
  imports: [ReadingsModule],
  controllers: [EvaluationController],
})
export class EvaluationModule {}
