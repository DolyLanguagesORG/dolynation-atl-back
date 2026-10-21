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

@ApiTags('content')
@ApiBearerAuth('access-token')
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a reading using the user’s saved preferences and the active AI provider',
    description:
      'Omitted fields fall back to the user’s saved settings (/settings/categories), ' +
      'then to a random pick from the catalog. Delegates generation and persistence to the readings module.',
  })
  @ApiCreatedResponseOf(ReadingDto)
  @ApiBadRequestResponse({
    description: 'Pending limit reached, AI provider failed, or validation error',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async generate(
    @CurrentUser() current: AuthUser,
    @Body() dto: GenerateContentDto,
  ): Promise<ApiResponse<ReadingDto>> {
    const reading = await this.content.generate(current.id, dto);
    return apiOk<ReadingDto>('Reading generated successfully', reading);
  }
}
