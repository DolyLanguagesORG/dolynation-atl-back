import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';

/**
 * Módulo que encapsula la creación y consulta de solicitudes de acceso a planes y desbloqueo de idioma.
 */
@Module({
  imports: [UsersModule, SubscriptionsModule, SettingsModule, MailModule],
  controllers: [AccessRequestsController],
  providers: [AccessRequestsService],
  exports: [AccessRequestsService],
})
export class AccessRequestsModule {}
