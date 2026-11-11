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

@ApiTags('settings')
@ApiBearerAuth('access-token')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get('categories')
  @ApiOperation({
    summary: 'Get the category catalog and the user’s current selection',
  })
  @ApiOkResponseOf(CategoriesSettingsDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async getCategories(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<CategoriesSettingsDto>> {
    await this.subscriptions.assertSubscriptionActive(current.id);
    const catalog = READING_CATEGORIES.map((id) => ({ id, name: getCategoryConfig(id).name }));
    const selected = await this.settings.getCategories(current.id);
    return apiOk('Categories settings', { catalog, selected });
  }

  @Put('categories')
  @ApiOperation({ summary: 'Persist the user’s category selection' })
  @ApiOkResponseOf(CategoriesSettingsDto)
  @ApiBadRequestResponse({
    description: 'Invalid category id or limit exceeded',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async updateCategories(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateCategoriesDto,
  ): Promise<ApiResponse<CategoriesSettingsDto>> {
    await this.subscriptions.assertCategoryLimit(current.id, dto.categories.length);
    const selected = await this.settings.setCategories(current.id, dto.categories);
    const catalog = READING_CATEGORIES.map((id) => ({ id, name: getCategoryConfig(id).name }));
    return apiOk('Categories updated', { catalog, selected });
  }

  @Get('languages')
  @ApiOperation({
    summary: 'Get the language catalog and the user’s current selection',
  })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async getLanguages(@CurrentUser() current: AuthUser): Promise<ApiResponse<LanguagesSettingsDto>> {
    await this.subscriptions.assertSubscriptionActive(current.id);
    const catalog = SUPPORTED_LANGUAGES.map((l) => ({ id: l.id, name: l.name }));
    const selected = await this.settings.getLanguage(current.id);
    return apiOk('Languages settings', { catalog, selected });
  }

  @Put('languages')
  @ApiOperation({ summary: 'Persist the user’s language selection' })
  @ApiOkResponseOf(LanguagesSettingsDto)
  @ApiBadRequestResponse({
    description: 'Invalid language id or not allowed for plan',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
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
