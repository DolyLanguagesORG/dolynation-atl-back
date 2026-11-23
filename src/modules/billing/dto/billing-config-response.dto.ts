import { ApiProperty } from '@nestjs/swagger';
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from '../../subscriptions/subscriptions.constants';
import { BILLING_UI_MODES, type BillingUiMode } from '../billing.constants';

/** Precio y condiciones de checkout asociadas a un nivel de suscripción. */
export class BillingPlanPricingDto {
  @ApiProperty({
    example: 'dolly_plus',
    enum: SUBSCRIPTION_TIERS,
    description: 'Subscription tier identifier',
  })
  tier!: SubscriptionTier;

  @ApiProperty({
    example: false,
    description: 'Indicates whether this tier is free ($0) and requires no checkout',
  })
  isFree!: boolean;

  @ApiProperty({
    example: true,
    description: 'Indicates whether activating this tier requires Stripe checkout',
  })
  checkoutRequired!: boolean;

  @ApiProperty({
    example: 9900,
    nullable: true,
    description: 'Unit price in smallest currency unit (e.g. centavos), or null if unavailable',
  })
  amountCents!: number | null;

  @ApiProperty({
    example: 'mxn',
    description: 'ISO 4217 lowercase currency code',
  })
  currency!: string;

  @ApiProperty({
    example: 'month',
    nullable: true,
    description: 'Recurring billing interval (e.g. month), or null for free tiers',
  })
  interval!: string | null;
}

/** Precio y disponibilidad del producto de pago único para desbloquear un idioma. */
export class BillingOneTimePricingDto {
  @ApiProperty({
    example: true,
    description: 'Indicates whether purchasing this item requires Stripe checkout',
  })
  checkoutRequired!: boolean;

  @ApiProperty({
    example: 4900,
    nullable: true,
    description: 'Unit price in smallest currency unit (e.g. centavos), or null if unavailable',
  })
  amountCents!: number | null;

  @ApiProperty({
    example: 'mxn',
    description: 'ISO 4217 lowercase currency code',
  })
  currency!: string;
}

/** Configuración pública de facturación que consume el frontend al mostrar opciones de pago. */
export class BillingConfigResponseDto {
  @ApiProperty({
    example: 'stripe',
    enum: ['manual', 'stripe'],
    description: 'Active billing provider for the current environment',
  })
  provider!: 'manual' | 'stripe';

  @ApiProperty({
    example: 'pk_test_example',
    nullable: true,
    description: 'Public Stripe publishable key for frontend Elements initialization',
  })
  publishableKey!: string | null;

  @ApiProperty({
    example: 'mxn',
    description: 'Default currency configured for billing',
  })
  currency!: string;

  @ApiProperty({
    example: 'custom',
    enum: BILLING_UI_MODES,
    description: 'Default checkout UI mode (custom uses PaymentElement + Appearance API)',
  })
  uiMode!: BillingUiMode;

  @ApiProperty({
    type: [BillingPlanPricingDto],
    description: 'Pricing summary for each subscription tier',
  })
  plans!: BillingPlanPricingDto[];

  @ApiProperty({
    type: BillingOneTimePricingDto,
    description: 'Pricing summary for one-time language unlock credits',
  })
  languageUnlock!: BillingOneTimePricingDto;
}
