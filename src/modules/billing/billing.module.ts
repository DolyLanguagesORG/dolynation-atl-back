import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SettingsModule } from '../settings/settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PAYMENT_GATEWAY } from './billing.constants';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeGateway } from './gateway/stripe.gateway';

/**
 * Módulo de pagos y facturación con Stripe Sandbox / producción.
 */
@Module({
  imports: [DatabaseModule, SettingsModule, SubscriptionsModule],
  controllers: [BillingController],
  providers: [
    StripeGateway,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: StripeGateway,
    },
    BillingService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
