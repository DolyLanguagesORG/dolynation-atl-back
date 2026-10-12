import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiBadRequestResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ChatResponseDto } from '../../common/types/api-response.dto';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { ChatRequestDto } from './dto/chat-request.dto';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import type { ChatMessage } from './providers/ai-provider.interface';

@ApiTags('ia')
@ApiBearerAuth('access-token')
@Controller('ia')
export class IaController {
  constructor(private readonly factory: AIProviderFactory) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a chat request to the active AI provider' })
  @ApiOkResponseOf(ChatResponseDto)
  @ApiBadRequestResponse({
    description: 'Validation error or AI provider failed',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async chat(@Body() dto: ChatRequestDto): Promise<ApiResponse<ChatResponseDto>> {
    const messages: ChatMessage[] = dto.systemPrompt
      ? [{ role: 'system', content: dto.systemPrompt }, ...dto.messages]
      : [...dto.messages];
    const text = await this.factory.getFullResponse(messages);
    return apiOk('AI response', { text });
  }
}
