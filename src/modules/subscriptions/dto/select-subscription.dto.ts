import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../subscriptions.constants';

export class SelectSubscriptionDto {
  @ApiProperty({
    example: 'dolly',
    description: 'Identifier of the chosen subscription plan',
    enum: SUBSCRIPTION_TIERS,
  })
  @IsString()
  @IsIn(SUBSCRIPTION_TIERS as readonly string[], {
    message: 'tier must be one of: dolly, dolly_plus, dolly_pro',
  })
  tier!: SubscriptionTier;
}
