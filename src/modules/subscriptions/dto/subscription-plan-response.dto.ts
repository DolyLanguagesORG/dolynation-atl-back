import { ApiProperty } from '@nestjs/swagger';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../subscriptions.constants';

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
      'Suscripción básica: hasta 5 categorías, lecturas en inglés, 10 lecturas y 15 preguntas al día.',
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
    example: ['en'],
    type: [String],
    description: 'Códigos de idiomas habilitados para la generación de lecturas',
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
