import { Module } from '@nestjs/common';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

/**
 * Módulo de historial y métricas de actividad del usuario (`/history`).
 */
@Module({
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
