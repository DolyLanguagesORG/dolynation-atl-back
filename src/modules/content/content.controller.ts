import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
      'Generar una lectura usando las preferencias guardadas del usuario y el proveedor de IA activo',
    description:
      'Los campos omitidos toman las preferencias guardadas del usuario (/settings/categories) ' +
      'y, en su defecto, una selección aleatoria del catálogo. Delega la generación y persistencia al módulo de lecturas.',
  })
  @ApiCreatedResponseOf(ReadingDto)
  @ApiBadRequestResponse({
    description:
      'Se alcanzó el límite de lecturas pendientes, falló el proveedor de IA o hubo un error de validación',
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
