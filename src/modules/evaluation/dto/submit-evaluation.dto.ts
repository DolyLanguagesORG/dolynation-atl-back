import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsString, Length } from 'class-validator';

/**
 * DTO de entrada para enviar el resumen de una lectura a evaluar.
 */
export class SubmitEvaluationDto {
  @ApiProperty({
    example: 42,
    description: 'ID de la lectura a evaluar (debe pertenecer al usuario autenticado)',
  })
  @IsInt()
  @IsPositive()
  readingId!: number;

  @ApiProperty({
    minLength: 20,
    example:
      'The reading was about the Industrial Revolution and how steam engines changed manufacturing.',
    description: 'Resumen de la lectura escrito por el usuario. Debe tener al menos 20 caracteres.',
  })
  @IsString()
  @Length(20)
  userResponse!: string;
}
