import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf, ApiOkResponseOfArray } from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { HistoryScoreEntryDto, HistorySummaryDto } from './dto/history-summary.dto';
import { HistoryService } from './history.service';

@ApiTags('history')
@ApiBearerAuth('access-token')
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Aggregated activity history for the authenticated user',
    description:
      'Returns readings totals (pending/completed/passed/average score), recent completed readings with their scores, and the words-looked-up counter.',
  })
  @ApiOkResponseOf(HistorySummaryDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async getSummary(@CurrentUser() current: AuthUser): Promise<ApiResponse<HistorySummaryDto>> {
    const summary = await this.history.getSummary(current.id);
    return apiOk('Activity history', summary);
  }

  @Get('scores')
  @ApiOperation({ summary: 'Most recent evaluated readings with their scores' })
  @ApiOkResponseOfArray(HistoryScoreEntryDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async getScores(@CurrentUser() current: AuthUser): Promise<ApiResponse<HistoryScoreEntryDto[]>> {
    const scores = await this.history.recentScoresFor(current.id);
    return apiOk('Recent scores', scores);
  }
}
