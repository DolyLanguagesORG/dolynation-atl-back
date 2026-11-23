import { ApiProperty } from '@nestjs/swagger';
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from '../../subscriptions/subscriptions.constants';

/** Datos no sensibles del método de pago predeterminado de una suscripción. */
export class BillingPaymentMethodSummaryDto {
  @ApiProperty({
    example: 'visa',
    nullable: true,
    description: 'Card brand or payment method type',
  })
  brand!: string | null;

  @ApiProperty({
    example: '4242',
    nullable: true,
    description: 'Last 4 digits of the card',
  })
  last4!: string | null;

  @ApiProperty({
    example: 12,
    nullable: true,
    description: 'Card expiration month',
  })
  expMonth!: number | null;

  @ApiProperty({
    example: 2030,
    nullable: true,
    description: 'Card expiration year',
  })
  expYear!: number | null;
}

/** Estado y periodo vigente de una suscripción de Stripe, sin exponer datos del medio de pago. */
export class BillingSubscriptionSummaryDto {
  @ApiProperty({
    example: 'active',
    description: 'Current Stripe subscription status',
  })
  status!: string;

  @ApiProperty({
    example: 'dolly_plus',
    enum: SUBSCRIPTION_TIERS,
    description: 'Subscription tier bound to this recurring Stripe subscription',
  })
  tier!: SubscriptionTier;

  @ApiProperty({
    example: '2026-11-20T10:00:00.000Z',
    nullable: true,
    description: 'Start timestamp of the current billing cycle',
  })
  currentPeriodStart!: Date | null;

  @ApiProperty({
    example: '2026-12-20T10:00:00.000Z',
    nullable: true,
    description: 'End timestamp of the current billing cycle',
  })
  currentPeriodEnd!: Date | null;

  @ApiProperty({
    example: false,
    description: 'True when subscription is scheduled to cancel at period end',
  })
  cancelAtPeriodEnd!: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Timestamp when the subscription was canceled, if applicable',
  })
  canceledAt!: Date | null;

  @ApiProperty({
    type: BillingPaymentMethodSummaryDto,
    nullable: true,
    description: 'Summary of the default payment method on the subscription',
  })
  paymentMethod!: BillingPaymentMethodSummaryDto | null;
}

/** Registro reciente de un pago o factura mostrado en la pantalla de facturación. */
export class BillingRecentPaymentDto {
  @ApiProperty({ example: 1, description: 'Internal payment record ID' })
  id!: number;

  @ApiProperty({
    example: 'language_unlock',
    description: 'Payment category (subscription, subscription_invoice, language_unlock)',
  })
  kind!: string;

  @ApiProperty({
    example: 'dolly_plus',
    nullable: true,
    description: 'Related subscription tier, if applicable',
  })
  tier!: string | null;

  @ApiProperty({ example: 4900, description: 'Amount in smallest currency unit' })
  amountCents!: number;

  @ApiProperty({ example: 'mxn', description: 'ISO 4217 currency code' })
  currency!: string;

  @ApiProperty({ example: 'paid', description: 'Payment fulfillment status' })
  status!: string;

  @ApiProperty({
    example: '2026-11-20T10:00:00.000Z',
    nullable: true,
    description: 'Timestamp when entitlement was granted',
  })
  fulfilledAt!: Date | null;

  @ApiProperty({
    example: '2026-11-20T09:59:00.000Z',
    description: 'Payment creation timestamp',
  })
  createdAt!: Date;
}

/** Estado de facturación del usuario y su historial reciente de pagos. */
export class BillingStatusResponseDto {
  @ApiProperty({
    example: 'stripe',
    enum: ['manual', 'stripe'],
    description: 'Active billing provider',
  })
  provider!: 'manual' | 'stripe';

  @ApiProperty({
    example: 'dolly_plus',
    nullable: true,
    enum: SUBSCRIPTION_TIERS,
    description: 'Effective subscription tier currently assigned to the user',
  })
  tier!: SubscriptionTier | null;

  @ApiProperty({
    type: BillingSubscriptionSummaryDto,
    nullable: true,
    description: 'Active or latest Stripe recurring subscription details',
  })
  subscription!: BillingSubscriptionSummaryDto | null;

  @ApiProperty({
    type: [BillingRecentPaymentDto],
    description: 'Most recent payment and invoice records for this user',
  })
  recentPayments!: BillingRecentPaymentDto[];
}
