import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../subscriptions.constants';

/**
 * DTO de entrada para seleccionar o cambiar el plan de suscripción del usuario.
 */
export class SelectSubscriptionDto {
  @ApiProperty({
    example: 'dolly',
    description: 'Identificador del plan de suscripción elegido',
    enum: SUBSCRIPTION_TIERS,
  })
  @IsString()
  @IsIn(SUBSCRIPTION_TIERS as readonly string[], {
    message: 'tier must be one of: dolly, dolly_plus, dolly_pro',
  })
  tier!: SubscriptionTier;
}
