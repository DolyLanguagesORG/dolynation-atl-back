import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ModerationModule } from '../moderation/moderation.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * Módulo de preferencias del usuario (`/settings`): categorías temáticas e idioma de interfaz.
 */
@Module({
  imports: [SubscriptionsModule, ModerationModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
