import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { MiniMaxProvider } from './providers/MiniMax-M3.provider';
import { AiDegradedService } from './ai-degraded.service';

@Module({
  controllers: [IaController],
  providers: [AIProviderFactory, MiniMaxProvider, AiDegradedService],
  exports: [AIProviderFactory, AiDegradedService],
})
export class IaModule {}
