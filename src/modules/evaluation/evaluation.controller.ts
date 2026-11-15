import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
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

/**
 * Controlador de evaluación de lecturas (`/evaluation`).
 */
@ApiTags('evaluation')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({
  description: 'Active subscription plan required (SUBSCRIPTION_REQUIRED)',
  type: ApiErrorDto,
})
@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly readings: ReadingsService) {}

  /**
   * Evalúa el resumen escrito por el usuario frente a la lectura original.
   */
  @Post('submit')
  @ApiOperation({
    summary: 'Enviar el resumen del usuario para su evaluación',
    description:
      'Califica el resumen frente a la lectura original, guarda el resultado y marca la lectura como completada. Delega la operación al módulo de lecturas.',
  })
  @ApiOkResponseOf(EvaluationResultDto)
  @ApiBadRequestResponse({
    description: 'Error de validación, lectura ya evaluada o fallo del proveedor de IA',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Lectura no encontrada o no pertenece a este usuario',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
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
