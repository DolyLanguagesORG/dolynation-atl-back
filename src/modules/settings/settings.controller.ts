import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { READING_CATEGORIES } from '../readings/prompt-generation/catalog.constants';
import { getCategoryConfig } from '../readings/prompt-generation/catalog.helpers';
import { SUPPORTED_LANGUAGES, type LanguageId } from './settings.constants';
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
   * Obtiene el catálogo de idiomas soportados y el idioma configurado por el usuario.
   */
  @Get('languages')
  @ApiOperation({
    summary: 'Obtener el catálogo de idiomas y la selección actual del usuario',
  })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async getLanguages(@CurrentUser() current: AuthUser): Promise<ApiResponse<LanguagesSettingsDto>> {
    await this.subscriptions.assertSubscriptionActive(current.id);
    const catalog = SUPPORTED_LANGUAGES.map((l) => ({ id: l.id, name: l.name }));
    const selected = await this.settings.getLanguage(current.id);
    return apiOk('Languages settings', { catalog, selected });
  }

  /**
   * Guarda el idioma seleccionado tras comprobar que el plan de suscripción lo permite.
   */
  @Put('languages')
  @ApiOperation({ summary: 'Guardar la selección de idioma del usuario' })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiBadRequestResponse({
    description: 'ID de idioma inválido o no permitido para el plan actual',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async updateLanguage(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateLanguageDto,
  ): Promise<ApiResponse<LanguagesSettingsDto>> {
    await this.subscriptions.assertLanguageAllowed(current.id, dto.language);
    const selected = await this.settings.setLanguage(current.id, dto.language as LanguageId);
    const catalog = SUPPORTED_LANGUAGES.map((l) => ({ id: l.id, name: l.name }));
    return apiOk('Language updated', { catalog, selected });
  }
}
