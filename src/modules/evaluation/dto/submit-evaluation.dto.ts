import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsString, Length } from 'class-validator';

export class SubmitEvaluationDto {
  @ApiProperty({
    example: 42,
    description: 'Id of the reading being evaluated (owned by the authenticated user)',
  })
  @IsInt()
  @IsPositive()
  readingId!: number;

  @ApiProperty({
    minLength: 20,
    example:
      'The reading was about the Industrial Revolution and how steam engines changed manufacturing.',
    description: 'The user’s summary of the reading. Must be at least 20 characters.',
  })
  @IsString()
  @Length(20)
  userResponse!: string;
}
