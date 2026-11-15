import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiCreatedResponseOf } from '../../common/types/api-envelope.decorators';
import { ReadingDto } from '../../common/types/api-response.dto';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ContentService } from './content.service';
import { GenerateContentDto } from './dto/generate-content.dto';

/**
 * Controlador de generación de contenido (`/content`).
 */
@ApiTags('content')
@ApiBearerAuth('access-token')
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /**
   * Genera una nueva lectura usando las preferencias del usuario y el proveedor de IA activo.
   */
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Generar una lectura usando el idioma elegido, las preferencias del usuario y el proveedor de IA activo',
    description:
      'Exige explícitamente `language` (es, en, fr o it) dentro de los idiomas activos del plan del usuario. ' +
      'Los campos opcionales toman las preferencias guardadas (/settings/categories) o una selección aleatoria del catálogo.',
  })
  @ApiCreatedResponseOf(ReadingDto)
  @ApiBadRequestResponse({
    description:
      'Falta el idioma obligatorio, se alcanzó el límite de lecturas pendientes, falló el proveedor de IA o hubo un error de validación',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description:
      'Suscripción requerida, sin idiomas seleccionados (LANGUAGE_NOT_SELECTED) o idioma fuera de los cupos activos del plan (SUBSCRIPTION_LANGUAGE_NOT_ALLOWED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async generate(
    @CurrentUser() current: AuthUser,
    @Body() dto: GenerateContentDto,
  ): Promise<ApiResponse<ReadingDto>> {
    const reading = await this.content.generate(current.id, dto);
    return apiOk<ReadingDto>('Reading generated successfully', reading);
  }
}
