import { Module } from '@nestjs/common';
import { ReadingsController } from './readings.controller';
import { ReadingsService } from './readings.service';
import { PromptBuilderService } from './prompt-generation';
import { AiResponseParserService } from './ai-response-parser.service';
import { PromptLogService, AuthEventLogService } from './prompt-logs';
import { UsersModule } from '../users/users.module';
import { IaModule } from '../ia/ia.module';
import { SettingsModule } from '../settings/settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ModerationModule } from '../moderation/moderation.module';

/**
 * Módulo principal de lecturas (`/readings`).
 * Orquesta generación de textos con IA, evaluación de resúmenes, explicaciones de vocabulario y bitácoras de prompts.
 */
@Module({
  imports: [UsersModule, IaModule, SettingsModule, SubscriptionsModule, ModerationModule],
  controllers: [ReadingsController],
  providers: [
    ReadingsService,
    PromptBuilderService,
    AiResponseParserService,
    PromptLogService,
    AuthEventLogService,
  ],
  exports: [
    ReadingsService,
    PromptLogService,
    AuthEventLogService,
    PromptBuilderService,
    AiResponseParserService,
  ],
})
export class ReadingsModule {}
