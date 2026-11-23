import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PAID_SUBSCRIPTION_TIERS, type PaidSubscriptionTier } from '../billing.constants';

/** Nivel de pago al que se solicita cambiar la suscripción activa. */
export class ChangePlanDto {
  @ApiProperty({
    example: 'dolly_pro',
    enum: PAID_SUBSCRIPTION_TIERS,
    description: 'Target paid subscription tier (dolly_plus or dolly_pro)',
  })
  @IsIn([...PAID_SUBSCRIPTION_TIERS])
  tier!: PaidSubscriptionTier;
}
