import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import {
  EvaluationResultDto,
  ExplanationResultDto,
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
import { CreateExplanationDto, EvaluateReadingDto, GenerateReadingDto } from './dto/readings.dto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';

@ApiTags('readings')
@ApiBearerAuth('access-token')
@Controller('readings')
export class ReadingsController {
  constructor(private readonly readings: ReadingsService) {}

  @Get('options')
  @ApiOperation({ summary: 'Get generation options (categories, difficulties, cefr)' })
  @ApiOkResponseOf(ReadingOptionsDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  getOptions(): ApiResponse<ReadingOptionsDto> {
    // The service returns a structurally similar but type-loose shape (id: string
    // vs the DTO's literal union). Cast to ReadingOptionsDto since this is the
    // canonical response type for the /readings/options endpoint.
    return apiOk('Generation options', this.readings.getOptions() as unknown as ReadingOptionsDto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new reading using the active AI provider' })
  @ApiCreatedResponseOf(ReadingDto)
  @ApiBadRequestResponse({
    description: 'Pending limit reached, AI provider failed, or validation error',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async generate(
    @CurrentUser() current: AuthUser,
    @Body() dto: GenerateReadingDto,
  ): Promise<ApiResponse<ReadingDto>> {
    const reading = await this.readings.generate({ userId: current.id, options: dto });
    return apiOk<ReadingDto>('Reading generated successfully', reading);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List the user’s pending readings' })
  @ApiOkResponseOfArray(ReadingDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async listPending(@CurrentUser() current: AuthUser): Promise<ApiResponse<ReadingDto[]>> {
    const list = await this.readings.listPending(current.id);
    return apiOk<ReadingDto[]>('Pending readings', list);
  }

  @Get('completed')
  @ApiOperation({ summary: 'List the user’s completed readings' })
  @ApiOkResponseOfArray(ReadingDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async listCompleted(@CurrentUser() current: AuthUser): Promise<ApiResponse<ReadingDto[]>> {
    const list = await this.readings.listCompleted(current.id);
    return apiOk<ReadingDto[]>('Completed readings', list);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single reading by id' })
  @ApiOkResponseOf(ReadingDto)
  @ApiNotFoundResponse({
    description: 'Reading not found or owned by another user',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async findOne(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<ReadingDto>> {
    const reading = await this.readings.findById(id, current.id);
    return apiOk<ReadingDto>('Reading', reading);
  }

  @Post(':id/evaluate')
  @ApiOperation({ summary: 'Evaluate the user’s summary of a reading' })
  @ApiOkResponseOf(EvaluationResultDto)
  @ApiBadRequestResponse({
    description: 'Validation error or reading already evaluated',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({ description: 'Reading not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
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

  @Post(':id/explanations')
  @ApiOperation({ summary: 'Explain a word in the context of a reading' })
  @ApiOkResponseOf(ExplanationResultDto)
  @ApiBadRequestResponse({ description: 'Validation error', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'Reading not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async explain(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateExplanationDto,
  ): Promise<ApiResponse<ExplanationResultDto>> {
    const result = await this.readings.explain(id, current.id, dto.word, dto.context);
    return apiOk<ExplanationResultDto>('Explanation', result);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a reading' })
  @ApiOkResponseEmpty()
  @ApiNotFoundResponse({ description: 'Reading not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async remove(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<null>> {
    await this.readings.remove(id, current.id);
    return apiOk('Deleted', null);
  }
}
