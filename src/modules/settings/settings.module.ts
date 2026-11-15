import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ModerationModule } from '../moderation/moderation.module';
import { CategoryDailyLimitService } from './category-daily-limit.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * Módulo de preferencias del usuario (`/settings`): categorías temáticas e idioma de interfaz.
 */
@Module({
  imports: [SubscriptionsModule, ModerationModule],
  controllers: [SettingsController],
  providers: [SettingsService, CategoryDailyLimitService],
  exports: [SettingsService, CategoryDailyLimitService],
})
export class SettingsModule {}
