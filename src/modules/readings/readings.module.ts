import { Module } from '@nestjs/common';
import { ReadingsController } from './readings.controller';
import { ReadingsService } from './readings.service';
import { PromptBuilderService } from './prompt-generation';
import { AiResponseParserService } from './ai-response-parser.service';
import { PromptLogService, AuthEventLogService } from './prompt-logs';
import { UsersModule } from '../users/users.module';
import { IaModule } from '../ia/ia.module';

@Module({
  imports: [UsersModule, IaModule],
  controllers: [ReadingsController],
  providers: [
    ReadingsService,
    PromptBuilderService,
    AiResponseParserService,
    PromptLogService,
    AuthEventLogService,
  ],
  exports: [PromptLogService, AuthEventLogService, PromptBuilderService, AiResponseParserService],
})
export class ReadingsModule {}
