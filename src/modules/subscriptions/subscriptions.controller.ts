import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf, ApiOkResponseOfArray } from '../../common/types/api-envelope.decorators';
import { Public } from '../../common/decorators/public.decorator';
import { AllowWithoutSubscription } from '../../common/decorators/allow-without-subscription.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { SelectSubscriptionDto } from './dto/select-subscription.dto';
import { SubscriptionPlanItemDto } from './dto/subscription-plan-response.dto';
import { UserSubscriptionResponseDto } from './dto/user-subscription-response.dto';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Controlador de planes de suscripción y estado/selección del plan del usuario.
 */
@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  /**
   * Lista públicamente todos los planes de suscripción disponibles y sus límites.
   */
  @Public()
  @Get('subscriptions/plans')
  @ApiOperation({ summary: 'Obtener todos los planes de suscripción disponibles y sus límites' })
  @ApiOkResponseOfArray(SubscriptionPlanItemDto)
  getPlans(): ApiResponse<SubscriptionPlanItemDto[]> {
    const plans = this.subscriptions.getPlans();
    return apiOk('Subscription plans', plans);
  }

  /**
   * Devuelve el plan contratado actual y los contadores de consumo diario del usuario autenticado.
   */
  @ApiBearerAuth('access-token')
  @Get('user/subscription')
  @ApiOperation({
    summary: 'Obtener el plan de suscripción actual del usuario autenticado y su consumo diario',
  })
  @ApiOkResponseOf(UserSubscriptionResponseDto)
  @ApiForbiddenResponse({
    description: 'Se requiere una suscripción activa (SUBSCRIPTION_REQUIRED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado', type: ApiErrorDto })
  async getCurrentSubscription(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<UserSubscriptionResponseDto>> {
    const result = await this.subscriptions.getUserSubscription(current.id);
    return apiOk('User subscription status', result);
  }

  /**
   * Permite seleccionar o cambiar manualmente el plan de suscripción del usuario autenticado.
   */
  @ApiBearerAuth('access-token')
  @AllowWithoutSubscription()
  @Post('user/subscription')
  @ApiOperation({
    summary: 'Seleccionar o actualizar manualmente el plan de suscripción del usuario',
    description:
      'Planes disponibles: dolly (básico), dolly_plus (intermedio), dolly_pro (avanzado).',
  })
  @ApiOkResponseOf(UserSubscriptionResponseDto)
  @ApiBadRequestResponse({ description: 'Nivel de suscripción inválido', type: ApiErrorDto })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({ description: 'Acceso denegado', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado', type: ApiErrorDto })
  async selectSubscription(
    @CurrentUser() current: AuthUser,
    @Body() dto: SelectSubscriptionDto,
  ): Promise<ApiResponse<UserSubscriptionResponseDto>> {
    const result = await this.subscriptions.selectSubscription(current.id, dto.tier);
    return apiOk('Subscription plan updated successfully', result);
  }
}
