import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { MiniMaxProvider } from './providers/MiniMax-M3.provider';

@Module({
  controllers: [IaController],
  providers: [AIProviderFactory, MiniMaxProvider],
  exports: [AIProviderFactory],
})
export class IaModule {}
