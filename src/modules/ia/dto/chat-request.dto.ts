import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ChatMessageDto } from './chat-message.dto';

/**
 * DTO de entrada para enviar una conversación al endpoint de chat con IA.
 */
export class ChatRequestDto {
  @ApiProperty({
    type: [ChatMessageDto],
    minItems: 1,
    maxItems: 50,
    description: 'Mensajes de la conversación en orden cronológico',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiProperty({
    required: false,
    description: 'Prompt de sistema opcional que se antepone a la conversación',
  })
  @IsOptional()
  @IsString()
  systemPrompt?: string;
}
