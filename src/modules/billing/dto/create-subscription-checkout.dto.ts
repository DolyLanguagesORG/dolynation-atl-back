import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  BILLING_UI_MODES,
  PAID_SUBSCRIPTION_TIERS,
  type BillingUiMode,
  type PaidSubscriptionTier,
} from '../billing.constants';

/** Nivel y presentación solicitados para iniciar el checkout de una suscripción. */
export class CreateSubscriptionCheckoutDto {
  @ApiProperty({
    example: 'dolly_plus',
    enum: PAID_SUBSCRIPTION_TIERS,
    description: 'Paid subscription tier to purchase (dolly_plus or dolly_pro)',
  })
  @IsIn([...PAID_SUBSCRIPTION_TIERS])
  tier!: PaidSubscriptionTier;

  @ApiPropertyOptional({
    example: 'custom',
    enum: BILLING_UI_MODES,
    description: 'Optional checkout UI mode override (custom or hosted)',
  })
  @IsOptional()
  @IsIn([...BILLING_UI_MODES])
  uiMode?: BillingUiMode;
}
