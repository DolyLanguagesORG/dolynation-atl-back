import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppVersionDto } from '../../common/dto/app-version.dto';
import { Public } from '../../common/decorators/public.decorator';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { appVersion } from '../../common/version';

/**
 * Versión del build en ejecución.
 *
 * Es un endpoint **público** y **sin dependencias**: no toca la base de
 * datos ni ningún servicio externo, porque su función es justamente auditar
 * qué está corriendo. Tiene que responder aunque la base esté caída.
 */
@ApiTags('version')
@Controller('version')
export class VersionController {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Versión del build en ejecución',
    description:
      'Devuelve la versión de la aplicación, la de este repositorio, el commit exacto y el momento de la construcción. No requiere autenticación.',
  })
  @ApiOkResponseOf(AppVersionDto)
  version(): ApiResponse<AppVersionDto> {
    return apiOk('Version', appVersion());
  }
}
