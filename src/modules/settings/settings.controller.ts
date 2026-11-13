import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { READING_CATEGORIES } from '../readings/prompt-generation/catalog.constants';
import { getCategoryConfig } from '../readings/prompt-generation/catalog.helpers';
import { CategoriesSettingsDto, LanguagesSettingsDto } from './dto/settings-catalog.dto';
import { UpdateCategoriesDto } from './dto/update-categories.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { SettingsService } from './settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { normalizeCategoryNames } from '../moderation/category-normalizer';

/**
 * Controlador de preferencias de aprendizaje y configuración del usuario (`/settings`).
 */
@ApiTags('settings')
@ApiBearerAuth('access-token')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /**
   * Obtiene el catálogo completo de categorías disponibles y las seleccionadas por el usuario.
   */
  @Get('categories')
  @ApiOperation({
    summary: 'Obtener el catálogo de categorías y la selección actual del usuario',
  })
  @ApiOkResponseOf(CategoriesSettingsDto)
  @ApiForbiddenResponse({
    description: 'Se requiere una suscripción activa (SUBSCRIPTION_REQUIRED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async getCategories(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<CategoriesSettingsDto>> {
    await this.subscriptions.assertSubscriptionActive(current.id);
    const catalog = READING_CATEGORIES.map((id) => ({ id, name: getCategoryConfig(id).name }));
    const selected = await this.settings.getCategories(current.id);
    return apiOk('Categories settings', { catalog, selected });
  }

  /**
   * Guarda la selección de categorías preferidas validando el límite del plan activo.
   */
  @Put('categories')
  @ApiOperation({ summary: 'Guardar la selección de categorías del usuario' })
  @ApiOkResponseOf(CategoriesSettingsDto)
  @ApiBadRequestResponse({
    description:
      'Categoría inválida o rechazada por moderación (CATEGORY_MODERATION_REJECTED), o límite del plan excedido',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Se requiere una suscripción activa (SUBSCRIPTION_REQUIRED)',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({
    description:
      'Límite diario de categorías nuevas distintas evaluadas alcanzado (CATEGORY_DAILY_LIMIT_REACHED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async updateCategories(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateCategoriesDto,
  ): Promise<ApiResponse<CategoriesSettingsDto>> {
    const normalized = normalizeCategoryNames(dto.categories);
    await this.subscriptions.assertCategoryLimit(current.id, normalized.length);
    const selected = await this.settings.setCategories(current.id, normalized);
    const catalog = READING_CATEGORIES.map((id) => ({ id, name: getCategoryConfig(id).name }));
    return apiOk('Categories updated', { catalog, selected });
  }

  /**
   * Obtiene el catálogo de idiomas soportados, la lista ordenada elegida, los activos y el estado del bloqueo anual.
   */
  @Get('languages')
  @ApiOperation({
    summary: 'Obtener el catálogo de idiomas y la selección priorizada del usuario',
  })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiForbiddenResponse({
    description: 'Se requiere una suscripción activa (SUBSCRIPTION_REQUIRED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async getLanguages(@CurrentUser() current: AuthUser): Promise<ApiResponse<LanguagesSettingsDto>> {
    const state = await this.settings.getLanguagesSettings(current.id);
    return apiOk('Languages settings', state);
  }

  /**
   * Guarda la selección priorizada de idiomas validando cupo del plan y candado anual / crédito pagado.
   */
  @Put('languages')
  @ApiOperation({
    summary: 'Guardar la selección priorizada de idiomas del usuario',
    description:
      'El límite depende del plan (1 en dolly, 2 en dolly_plus, 4 en dolly_pro). Reemplazar un idioma ya elegido solo se permite una vez cada 365 días o consumiendo un crédito pagado en POST /settings/languages/unlock-change.',
  })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiBadRequestResponse({
    description: 'Lista vacía, idioma inválido o límite de idiomas del plan excedido',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description:
      'Suscripción requerida o cambio de idioma bloqueado hasta cumplir 1 año o pagar desbloqueo (LANGUAGE_CHANGE_LOCKED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async updateLanguages(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateLanguageDto,
  ): Promise<ApiResponse<LanguagesSettingsDto>> {
    const state = await this.settings.setLanguages(current.id, dto.languages);
    return apiOk('Languages updated', state);
  }

  /**
   * Reordena la prioridad de los idiomas ya guardados por el usuario (índice 0 = más importante)
   * sin agregar ni eliminar idiomas, protegiendo el orden preferido ante un downgrade de suscripción.
   */
  @Put('languages/reorder')
  @ApiOperation({
    summary: 'Reordenar la prioridad de los idiomas seleccionados',
    description:
      'Permite editar el orden de importancia de los idiomas guardados (posición 0 = más importante) sin agregar ni quitar elementos.',
  })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiBadRequestResponse({
    description: 'Los idiomas enviados no coinciden con la lista actual del usuario',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description:
      'Suscripción requerida, sin idiomas seleccionados o intento de promover un idioma inactivo tras downgrade sin desbloqueo (LANGUAGE_CHANGE_LOCKED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async reorderLanguages(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateLanguageDto,
  ): Promise<ApiResponse<LanguagesSettingsDto>> {
    const state = await this.settings.reorderLanguages(current.id, dto.languages);
    return apiOk('Languages reordered', state);
  }

  /**
   * Registra el pago manual que acredita 1 cambio de idioma inmediato antes de cumplir 365 días.
   */
  @Post('languages/unlock-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desbloquear cambio de idioma mediante pago manual',
    description:
      'Otorga 1 crédito consumible en PUT /settings/languages (o promoción tras downgrade) para cambiar idioma antes del plazo anual sin aumentar el cupo del plan.',
  })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiForbiddenResponse({
    description: 'Se requiere una suscripción activa (SUBSCRIPTION_REQUIRED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async unlockLanguageChange(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<LanguagesSettingsDto>> {
    const state = await this.settings.unlockLanguageChange(current.id);
    return apiOk('Language change unlocked', state);
  }
}
