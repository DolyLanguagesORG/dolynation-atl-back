import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { ReadingsModule } from '../readings/readings.module';

@Module({
  imports: [ReadingsModule],
  controllers: [EvaluationController],
})
export class EvaluationModule {}
