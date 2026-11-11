import { ApiProperty } from '@nestjs/swagger';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../subscriptions.constants';

export class SubscriptionPlanItemDto {
  @ApiProperty({ example: 'dolly', enum: SUBSCRIPTION_TIERS })
  id!: SubscriptionTier;

  @ApiProperty({ example: 'Dolly' })
  name!: string;

  @ApiProperty({
    example:
      'Suscripción básica: hasta 5 categorías, lecturas en inglés, 10 lecturas y 15 preguntas al día.',
  })
  description!: string;

  @ApiProperty({
    example: 5,
    nullable: true,
    description: 'Maximum allowed categories (null = unlimited)',
  })
  maxCategories!: number | null;

  @ApiProperty({
    example: ['en'],
    type: [String],
    description: 'Supported language codes for reading generation',
  })
  allowedLanguages!: string[];

  @ApiProperty({
    example: 10,
    nullable: true,
    description: 'Daily new readings generation limit (null = unlimited)',
  })
  dailyReadingsLimit!: number | null;

  @ApiProperty({
    example: 15,
    nullable: true,
    description: 'Daily reading questions/explanations limit (null = unlimited)',
  })
  dailyQuestionsLimit!: number | null;
}

export class SubscriptionPlansListDto {
  @ApiProperty({ type: [SubscriptionPlanItemDto] })
  plans!: SubscriptionPlanItemDto[];
}
