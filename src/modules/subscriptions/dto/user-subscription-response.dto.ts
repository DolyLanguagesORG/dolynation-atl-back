import { ApiProperty } from '@nestjs/swagger';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '../subscriptions.constants';
import { SubscriptionPlanItemDto } from './subscription-plan-response.dto';

/**
 * DTO con el uso actual del usuario frente a las cuotas permitidas por su suscripción.
 */
export class SubscriptionUsageDto {
  @ApiProperty({
    example: 3,
    description: 'Cantidad de categorías activas configuradas actualmente por el usuario',
  })
  categoriesCount!: number;

  @ApiProperty({
    example: 5,
    nullable: true,
    description: 'Máximo de categorías permitidas (`null` = ilimitado)',
  })
  categoriesLimit!: number | null;

  @ApiProperty({
    example: 2,
    description: 'Lecturas generadas en el día actual por el usuario',
  })
  readingsCreatedToday!: number;

  @ApiProperty({
    example: 10,
    nullable: true,
    description: 'Límite diario de generación de lecturas (`null` = ilimitado)',
  })
  readingsLimit!: number | null;

  @ApiProperty({
    example: 8,
    nullable: true,
    description: 'Lecturas restantes que puede generar hoy (`null` = ilimitado)',
  })
  readingsRemainingToday!: number | null;

  @ApiProperty({
    example: 4,
    description: 'Preguntas o explicaciones solicitadas hoy por el usuario',
  })
  questionsAskedToday!: number;

  @ApiProperty({
    example: 15,
    nullable: true,
    description: 'Límite diario de preguntas (`null` = ilimitado)',
  })
  questionsLimit!: number | null;

  @ApiProperty({
    example: 11,
    nullable: true,
    description: 'Preguntas restantes disponibles para hoy (`null` = ilimitado)',
  })
  questionsRemainingToday!: number | null;
}

/**
 * Respuesta completa del estado de suscripción del usuario junto con su consumo diario.
 */
export class UserSubscriptionResponseDto {
  @ApiProperty({
    example: true,
    description: 'Indica si el usuario tiene actualmente una suscripción activa seleccionada',
  })
  hasSubscription!: boolean;

  @ApiProperty({
    example: 'dolly',
    nullable: true,
    enum: SUBSCRIPTION_TIERS,
    description: 'Nivel de suscripción actual o nulo si aún no elige uno',
  })
  tier!: SubscriptionTier | null;

  @ApiProperty({
    type: SubscriptionPlanItemDto,
    nullable: true,
    description: 'Detalle del plan activo o nulo',
  })
  plan!: SubscriptionPlanItemDto | null;

  @ApiProperty({
    type: SubscriptionUsageDto,
    description: 'Contadores de consumo diario del usuario',
  })
  usage!: SubscriptionUsageDto;
}
