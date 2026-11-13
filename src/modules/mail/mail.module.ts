import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Módulo de correo transaccional.
 *
 * Expone `MailService` a los módulos que lo necesiten (hoy `AuthModule`). No
 * tiene controller: el correo es un servicio interno, no un recurso HTTP.
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
