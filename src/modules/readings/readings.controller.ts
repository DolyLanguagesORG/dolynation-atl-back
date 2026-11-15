import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import {
  EvaluationResultDto,
  ExplanationResultDto,
  GlossaryEntryDto,
  ReadingDto,
  ReadingOptionsDto,
} from '../../common/types/api-response.dto';
import {
  ApiCreatedResponseOf,
  ApiOkResponseEmpty,
  ApiOkResponseOf,
  ApiOkResponseOfArray,
} from '../../common/types/api-envelope.decorators';
import { ReadingsService } from './readings.service';
import {
  CreateExplanationDto,
  EvaluateReadingDto,
  GenerateReadingDto,
  GlossaryQueryDto,
  ToggleGlossarySaveDto,
} from './dto/readings.dto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';

/**
 * Controlador de gestión, generación, evaluación y explicación de lecturas (`/readings`).
 */
@ApiTags('readings')
@ApiBearerAuth('access-token')
@Controller('readings')
export class ReadingsController {
  constructor(private readonly readings: ReadingsService) {}

  /**
   * Devuelve las opciones válidas del catálogo para generar lecturas (categorías, dificultades y niveles CEFR).
   */
  @Get('options')
  @ApiOperation({ summary: 'Obtener opciones de generación (categorías, dificultades, CEFR)' })
  @ApiOkResponseOf(ReadingOptionsDto)
  @ApiForbiddenResponse({
    description: 'Se requiere una suscripción activa (SUBSCRIPTION_REQUIRED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  getOptions(): ApiResponse<ReadingOptionsDto> {
    return apiOk('Generation options', this.readings.getOptions());
  }

  /**
   * Genera y almacena una nueva lectura utilizando el proveedor de IA activo.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generar una nueva lectura usando el proveedor de IA activo' })
  @ApiCreatedResponseOf(ReadingDto)
  @ApiBadRequestResponse({
    description:
      'Se alcanzó el límite de lecturas pendientes, falta el idioma obligatorio, la categoría no es válida o falló el proveedor de IA',
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
    @Body() dto: GenerateReadingDto,
  ): Promise<ApiResponse<ReadingDto>> {
    const reading = await this.readings.generate({ userId: current.id, options: dto });
    return apiOk<ReadingDto>('Reading generated successfully', reading);
  }

  /**
   * Lista las lecturas pendientes de evaluación del usuario autenticado.
   */
  @Get('pending')
  @ApiOperation({ summary: 'Listar las lecturas pendientes del usuario' })
  @ApiOkResponseOfArray(ReadingDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async listPending(@CurrentUser() current: AuthUser): Promise<ApiResponse<ReadingDto[]>> {
    const list = await this.readings.listPending(current.id);
    return apiOk<ReadingDto[]>('Pending readings', list);
  }

  /**
   * Lista las lecturas ya evaluadas y completadas del usuario autenticado.
   */
  @Get('completed')
  @ApiOperation({ summary: 'Listar las lecturas completadas del usuario' })
  @ApiOkResponseOfArray(ReadingDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async listCompleted(@CurrentUser() current: AuthUser): Promise<ApiResponse<ReadingDto[]>> {
    const list = await this.readings.listCompleted(current.id);
    return apiOk<ReadingDto[]>('Completed readings', list);
  }

  /**
   * Lista las entradas del glosario personal y consultas contextuales del usuario autenticado.
   */
  @Get('glossary')
  @ApiOperation({ summary: 'List personal glossary and contextual help entries for the user' })
  @ApiOkResponseOfArray(GlossaryEntryDto)
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  async listGlossary(
    @CurrentUser() current: AuthUser,
    @Query() query: GlossaryQueryDto,
  ): Promise<ApiResponse<GlossaryEntryDto[]>> {
    const entries = await this.readings.listGlossary(current.id, query);
    return apiOk<GlossaryEntryDto[]>('Glossary entries', entries);
  }

  /**
   * Obtiene el detalle de una lectura específica perteneciente al usuario.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una lectura por su identificador' })
  @ApiOkResponseOf(ReadingDto)
  @ApiNotFoundResponse({
    description: 'Lectura no encontrada o pertenece a otro usuario',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async findOne(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<ReadingDto>> {
    const reading = await this.readings.findById(id, current.id);
    return apiOk<ReadingDto>('Reading', reading);
  }

  /**
   * Evalúa el resumen enviado por el usuario sobre la lectura indicada.
   */
  @Post(':id/evaluate')
  @ApiOperation({ summary: 'Evaluar el resumen del usuario para una lectura' })
  @ApiOkResponseOf(EvaluationResultDto)
  @ApiBadRequestResponse({
    description: 'Error de validación o la lectura ya fue evaluada',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({ description: 'Lectura no encontrada', type: ApiErrorDto })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async evaluate(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluateReadingDto,
  ): Promise<ApiResponse<EvaluationResultDto>> {
    const result = await this.readings.evaluate(id, current.id, dto);
    return apiOk<EvaluationResultDto>(
      'Evaluation complete',
      result as unknown as EvaluationResultDto,
    );
  }

  /**
   * Lista las explicaciones contextuales generadas previamente para la lectura indicada.
   */
  @Get(':id/explanations')
  @ApiOperation({ summary: 'List contextual help explanations saved for a reading' })
  @ApiOkResponseOfArray(GlossaryEntryDto)
  @ApiNotFoundResponse({ description: 'Reading not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  async listExplanations(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<GlossaryEntryDto[]>> {
    const entries = await this.readings.listReadingExplanations(id, current.id);
    return apiOk<GlossaryEntryDto[]>('Reading explanations', entries);
  }

  /**
   * Genera una explicación contextual de una palabra o frase dentro de la lectura.
   */
  @Post(':id/explanations')
  @ApiOperation({ summary: 'Explain a word or expression within a reading context' })
  @ApiCreatedResponseOf(ExplanationResultDto)
  @ApiBadRequestResponse({ description: 'Validation error', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'Reading not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  async explain(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateExplanationDto,
  ): Promise<ApiResponse<ExplanationResultDto>> {
    const result = await this.readings.explain(
      id,
      current.id,
      dto.word,
      dto.context,
      dto.forceRefresh ?? false,
    );
    return apiOk<ExplanationResultDto>('Explanation', result);
  }

  /**
   * Guarda o quita una explicación del glosario personal del usuario sin borrar su historial de cuota.
   */
  @Patch('explanations/:explanationId/glossary')
  @ApiOperation({ summary: 'Bookmark or unbookmark an explanation in the user personal glossary' })
  @ApiOkResponseOf(GlossaryEntryDto)
  @ApiNotFoundResponse({ description: 'Explanation entry not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  async toggleGlossarySave(
    @CurrentUser() current: AuthUser,
    @Param('explanationId', ParseIntPipe) explanationId: number,
    @Body() dto: ToggleGlossarySaveDto,
  ): Promise<ApiResponse<GlossaryEntryDto>> {
    const updated = await this.readings.toggleGlossarySave(explanationId, current.id, dto.isSaved);
    return apiOk<GlossaryEntryDto>('Glossary entry updated', updated);
  }

  /**
   * Realiza el borrado lógico (soft-delete) de una lectura del usuario.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar lógicamente una lectura' })
  @ApiOkResponseEmpty()
  @ApiNotFoundResponse({ description: 'Lectura no encontrada', type: ApiErrorDto })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async remove(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<null>> {
    await this.readings.remove(id, current.id);
    return apiOk('Deleted', null);
  }
}
