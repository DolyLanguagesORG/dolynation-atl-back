import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/** Rol permitido en un mensaje de chat compatible con Chat Completions. */
export type ChatRole = 'system' | 'user' | 'assistant';

/**
 * DTO que representa un mensaje individual dentro de una conversación con la IA.
 */
export class ChatMessageDto {
  @ApiProperty({
    enum: ['system', 'user', 'assistant'],
    description: 'Rol del emisor del mensaje en la conversación',
  })
  @IsEnum(['system', 'user', 'assistant'])
  role!: ChatRole;

  @ApiProperty({
    minLength: 1,
    maxLength: 32000,
    description: 'Contenido textual del mensaje',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(32000)
  content!: string;
}
