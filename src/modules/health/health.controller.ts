import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheckResultDto } from '../../common/types/api-response.dto';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { Public } from '../../common/decorators/public.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @Get('live')
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  @ApiOkResponseOf(HealthCheckResultDto)
  live(): Promise<ApiResponse<HealthCheckResult>> {
    return this.health
      .check([() => ({ app: { status: 'up', uptime: process.uptime() } })])
      .then((result) => apiOk('Liveness', result));
  }

  @Public()
  @Get('ready')
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({ summary: 'Readiness probe — DB is reachable' })
  @ApiOkResponseOf(HealthCheckResultDto)
  ready(): Promise<ApiResponse<HealthCheckResult>> {
    return this.health
      .check([
        async () => {
          await Promise.resolve();
          return { db: { status: 'up' as const } };
        },
      ])
      .then((result) => apiOk('Readiness', result));
  }
}
