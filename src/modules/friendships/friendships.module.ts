import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsService } from './friendships.service';
import { FriendStreakService } from './friend-streak.service';
import { ReadingsModule } from '../readings/readings.module';

/** Módulo social de solicitudes, amistades, invitaciones y bloqueos. */
@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    MailModule,
    SettingsModule,
    SubscriptionsModule,
    ReadingsModule,
  ],
  controllers: [FriendshipsController],
  providers: [FriendshipsService, FriendStreakService],
  exports: [FriendshipsService, FriendStreakService],
})
export class FriendshipsModule {}
