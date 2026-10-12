import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export type ChatRole = 'system' | 'user' | 'assistant';

export class ChatMessageDto {
  @ApiProperty({ enum: ['system', 'user', 'assistant'] })
  @IsEnum(['system', 'user', 'assistant'])
  role!: ChatRole;

  @ApiProperty({ minLength: 1, maxLength: 32000 })
  @IsString()
  @MinLength(1)
  @MaxLength(32000)
  content!: string;
}
