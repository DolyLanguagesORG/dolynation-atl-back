import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf, ApiOkResponseOfArray } from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { HistoryScoreEntryDto, HistorySummaryDto } from './dto/history-summary.dto';
import { HistoryService } from './history.service';

/**
 * Controlador de consultas de historial y calificaciones (`/history`).
 */
@ApiTags('history')
@ApiBearerAuth('access-token')
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  /**
   * Devuelve el resumen agregado de lecturas, puntajes recientes y palabras consultadas.
   */
  @Get()
  @ApiOperation({
    summary: 'Historial agregado de actividad del usuario autenticado',
    description:
      'Devuelve totales de lecturas (pendientes/completadas/aprobadas/puntaje promedio), lecturas completadas recientes con su puntaje y el contador de palabras consultadas.',
  })
  @ApiOkResponseOf(HistorySummaryDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async getSummary(@CurrentUser() current: AuthUser): Promise<ApiResponse<HistorySummaryDto>> {
    const summary = await this.history.getSummary(current.id);
    return apiOk('Activity history', summary);
  }

  /**
   * Lista las lecturas evaluadas más recientes del usuario con su calificación.
   */
  @Get('scores')
  @ApiOperation({ summary: 'Lecturas evaluadas más recientes junto con su calificación' })
  @ApiOkResponseOfArray(HistoryScoreEntryDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async getScores(@CurrentUser() current: AuthUser): Promise<ApiResponse<HistoryScoreEntryDto[]>> {
    const scores = await this.history.recentScoresFor(current.id);
    return apiOk('Recent scores', scores);
  }
}
