import { ApiProperty } from '@nestjs/swagger';
import {
  BILLING_UI_MODES,
  PAID_SUBSCRIPTION_TIERS,
  type BillingUiMode,
  type PaidSubscriptionTier,
} from '../billing.constants';

/** Datos de inicialización del checkout de Stripe en modo hospedado o integrado. */
export class CheckoutSessionResponseDto {
  @ApiProperty({
    example: 'cs_test_123456',
    description: 'Stripe Checkout Session identifier',
  })
  sessionId!: string;

  @ApiProperty({
    example: 'cs_test_secret_123456',
    nullable: true,
    description: 'Checkout client secret for custom PaymentElement UI mode',
  })
  clientSecret!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Hosted Stripe Checkout URL when uiMode is hosted',
  })
  url!: string | null;

  @ApiProperty({
    example: 'pk_test_example',
    description: 'Stripe publishable key for Stripe.js initialization',
  })
  publishableKey!: string;

  @ApiProperty({
    example: 'custom',
    enum: BILLING_UI_MODES,
    description: 'UI mode used to initialize the Checkout Session',
  })
  uiMode!: BillingUiMode;

  @ApiProperty({
    example: 'dolly_plus',
    nullable: true,
    enum: PAID_SUBSCRIPTION_TIERS,
    description: 'Target subscription tier when purchasing a subscription, or null for unlocks',
  })
  tier!: PaidSubscriptionTier | null;
}
