import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { HealthCheckResultDto } from '../../common/types/api-response.dto';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { Public } from '../../common/decorators/public.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { appVersion } from '../../common/version';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly healthIndicator: HealthIndicatorService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  @Public()
  @Get('live')
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  @ApiOkResponseOf(HealthCheckResultDto)
  live(): Promise<ApiResponse<HealthCheckResult>> {
    return this.health
      .check([() => ({ app: { status: 'up', uptime: process.uptime(), ...appVersion() } })])
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
          try {
            await this.db.execute(sql`SELECT 1`);
          } catch {
            return this.healthIndicator.check('db').down('Database is unreachable');
          }
          return this.healthIndicator.check('db').up();
        },
        () => ({ app: { status: 'up' as const, ...appVersion() } }),
      ])
      .then((result) => apiOk('Readiness', result));
  }
}
