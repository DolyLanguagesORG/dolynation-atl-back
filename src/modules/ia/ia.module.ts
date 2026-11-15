import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { GoogleProvider } from './providers/google.provider';
import { MiniMaxProvider } from './providers/MiniMax-M3.provider';
import { AiDegradedService } from './ai-degraded.service';
import { GoogleDecisionsService } from './decisions/google-decisions.service';

/**
 * Módulo de integración con proveedores de inteligencia artificial (`/ia`).
 * Exporta la fábrica de proveedores, el servicio resiliente y la compuerta de decisiones.
 */
@Module({
  controllers: [IaController],
  providers: [
    AIProviderFactory,
    MiniMaxProvider,
    GoogleProvider,
    AiDegradedService,
    GoogleDecisionsService,
  ],
  exports: [AIProviderFactory, AiDegradedService, GoogleDecisionsService],
})
export class IaModule {}
