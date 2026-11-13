import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { MiniMaxProvider } from './providers/MiniMax-M3.provider';
import { AiDegradedService } from './ai-degraded.service';

/**
 * Módulo de integración con proveedores de inteligencia artificial (`/ia`).
 * Exporta la fábrica de proveedores y el servicio con circuit breaker ante degradación.
 */
@Module({
  controllers: [IaController],
  providers: [AIProviderFactory, MiniMaxProvider, AiDegradedService],
  exports: [AIProviderFactory, AiDegradedService],
})
export class IaModule {}
