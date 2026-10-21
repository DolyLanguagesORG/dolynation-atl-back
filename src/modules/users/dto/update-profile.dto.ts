import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * PATCH /user/profile — only safe-to-mutate fields.
 * Email and password are intentionally excluded: they belong to dedicated flows
 * with verification / re-authentication.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Jane Doe',
    minLength: 1,
    maxLength: 255,
    description: 'Display name; trimmed, non-empty when provided',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/\S/, { message: 'fullName must contain at least one non-whitespace character' })
  fullName?: string;
}
