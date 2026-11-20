import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../subscriptions.constants';

/**
 * Información comercial de precios asociada a un plan de suscripción.
 */
export class SubscriptionPlanPricingDto {
  @ApiProperty({
    example: true,
    description: 'Indicates whether this plan is free ($0) and requires no checkout',
  })
  isFree!: boolean;

  @ApiProperty({
    example: false,
    description: 'Indicates whether activating this plan requires Stripe checkout',
  })
  checkoutRequired!: boolean;

  @ApiProperty({
    example: 0,
    nullable: true,
    description: 'Unit amount in smallest currency unit (e.g. centavos), or null if unavailable',
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
    description: 'Recurring billing interval (e.g. month), or null for free plans',
  })
  interval!: string | null;
}

/**
 * DTO descriptivo de un plan de suscripción y sus cuotas configuradas.
 */
export class SubscriptionPlanItemDto {
  @ApiProperty({
    example: 'dolly',
    enum: SUBSCRIPTION_TIERS,
    description: 'Identificador único del nivel de suscripción',
  })
  id!: SubscriptionTier;

  @ApiProperty({ example: 'Dolly', description: 'Nombre comercial del plan' })
  name!: string;

  @ApiProperty({
    example:
      'Suscripción básica: hasta 5 categorías, 1 idioma elegible (ES, EN, FR, IT), 10 lecturas y 15 preguntas al día.',
    description: 'Descripción legible de los beneficios incluidos en el plan',
  })
  description!: string;

  @ApiProperty({
    example: 5,
    nullable: true,
    description: 'Máximo de categorías permitidas (`null` = ilimitado)',
  })
  maxCategories!: number | null;

  @ApiProperty({
    example: 1,
    description: 'Máximo de idiomas simultáneos que el usuario puede seleccionar con este plan',
  })
  maxLanguages!: number;

  @ApiProperty({
    example: ['es', 'en', 'fr', 'it'],
    type: [String],
    description: 'Catálogo de códigos de idiomas elegibles dentro del plan',
  })
  allowedLanguages!: string[];

  @ApiProperty({
    example: 10,
    nullable: true,
    description: 'Límite diario de generación de lecturas nuevas (`null` = ilimitado)',
  })
  dailyReadingsLimit!: number | null;

  @ApiProperty({
    example: 15,
    nullable: true,
    description: 'Límite diario de preguntas o explicaciones sobre lecturas (`null` = ilimitado)',
  })
  dailyQuestionsLimit!: number | null;

  @ApiPropertyOptional({
    type: SubscriptionPlanPricingDto,
    description: 'Pricing and checkout metadata when billing configuration is active',
  })
  pricing?: SubscriptionPlanPricingDto;
}

/**
 * DTO contenedor del listado de planes de suscripción.
 */
export class SubscriptionPlansListDto {
  @ApiProperty({
    type: [SubscriptionPlanItemDto],
    description: 'Lista de planes de suscripción disponibles',
  })
  plans!: SubscriptionPlanItemDto[];
}
