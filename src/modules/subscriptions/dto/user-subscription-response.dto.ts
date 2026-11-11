import { ApiProperty } from '@nestjs/swagger';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../subscriptions.constants';
import { SubscriptionPlanItemDto } from './subscription-plan-response.dto';

export class SubscriptionUsageDto {
  @ApiProperty({
    example: 3,
    description: 'Number of active categories currently configured by the user',
  })
  categoriesCount!: number;

  @ApiProperty({
    example: 5,
    nullable: true,
    description: 'Maximum allowed categories (null = unlimited)',
  })
  categoriesLimit!: number | null;

  @ApiProperty({ example: 2, description: 'Readings generated today by the user' })
  readingsCreatedToday!: number;

  @ApiProperty({
    example: 10,
    nullable: true,
    description: 'Daily reading generation limit (null = unlimited)',
  })
  readingsLimit!: number | null;

  @ApiProperty({
    example: 8,
    nullable: true,
    description: 'Remaining readings that can be generated today (null = unlimited)',
  })
  readingsRemainingToday!: number | null;

  @ApiProperty({ example: 4, description: 'Questions/explanations asked today by the user' })
  questionsAskedToday!: number;

  @ApiProperty({
    example: 15,
    nullable: true,
    description: 'Daily question limit (null = unlimited)',
  })
  questionsLimit!: number | null;

  @ApiProperty({
    example: 11,
    nullable: true,
    description: 'Remaining questions for today (null = unlimited)',
  })
  questionsRemainingToday!: number | null;
}

export class UserSubscriptionResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the user currently has an active subscription selected',
  })
  hasSubscription!: boolean;

  @ApiProperty({ example: 'dolly', nullable: true, enum: SUBSCRIPTION_TIERS })
  tier!: SubscriptionTier | null;

  @ApiProperty({ type: SubscriptionPlanItemDto, nullable: true })
  plan!: SubscriptionPlanItemDto | null;

  @ApiProperty({ type: SubscriptionUsageDto })
  usage!: SubscriptionUsageDto;
}
