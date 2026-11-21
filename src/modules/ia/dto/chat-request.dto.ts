import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
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
    maxItems: 20,
    description: 'Mensajes de la conversación en orden cronológico',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiProperty({
    required: false,
    maxLength: 2000,
    description: 'Prompt de sistema opcional que se antepone a la conversación',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  systemPrompt?: string;
}
