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

export class ChatRequestDto {
  @ApiProperty({
    type: [ChatMessageDto],
    minItems: 1,
    maxItems: 50,
    description: 'Conversation messages in chronological order',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiProperty({
    required: false,
    description: 'Optional system prompt prepended to the conversation',
  })
  @IsOptional()
  @IsString()
  systemPrompt?: string;
}
