import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { EvaluationResultDto } from '../../common/types/api-response.dto';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ReadingsService } from '../readings/readings.service';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';

@ApiTags('evaluation')
@ApiBearerAuth('access-token')
@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly readings: ReadingsService) {}

  @Post('submit')
  @ApiOperation({
    summary: 'Submit the user’s summary for evaluation',
    description:
      'Scores the summary against the original reading, persists the result, and marks the reading as completed. Delegates to the readings module.',
  })
  @ApiOkResponseOf(EvaluationResultDto)
  @ApiBadRequestResponse({
    description: 'Validation error, reading already evaluated, or AI provider failure',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Reading not found or not owned by this user',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async submit(
    @CurrentUser() current: AuthUser,
    @Body() dto: SubmitEvaluationDto,
  ): Promise<ApiResponse<EvaluationResultDto>> {
    const result = await this.readings.evaluate(dto.readingId, current.id, {
      userResponse: dto.userResponse,
    });
    return apiOk<EvaluationResultDto>(
      'Evaluation complete',
      result as unknown as EvaluationResultDto,
    );
  }
}
