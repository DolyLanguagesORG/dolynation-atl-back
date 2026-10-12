import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

/**
 * Documented in OpenAPI. Represents a per-field validation error inside
 * `ApiErrorDto.details.fields`.
 */
export class ValidationFieldErrorDto {
  @ApiProperty({
    description: 'Field name in the request body, or "_root" for general errors',
    example: 'email',
  })
  field!: string;

  @ApiProperty({
    description: 'Human-readable error message for this field',
    example: 'must be a valid email',
  })
  message!: string;
}

/**
 * The `error` field shape inside any error response envelope. Used as the
 * type for `@ApiResponse({ type: ApiErrorResponseDto })` decorators.
 *
 * The full envelope (with `message` and `data: null`) is the same shape as
 * the success envelope, so we don't need a separate wrapper class — that
 * is what caused a circular dependency. Controllers document the
 * error response with the same ApiResponse shape used for success, just
 * with `type: ApiErrorDto` on the error field.
 */
export class ApiErrorDto {
  @ApiProperty({
    description: 'Stable machine-readable error code (see ErrorCode enum)',
    example: 'RESOURCE_NOT_FOUND',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable error message, safe to display to end users',
    example: 'The requested resource was not found',
  })
  message!: string;

  @ApiProperty({
    required: false,
    description:
      'Optional context. For VALIDATION_ERROR contains a `fields` array of { field, message } objects.',
    type: Object,
    additionalProperties: true,
    example: { fields: [{ field: 'email', message: 'must be a valid email' }] },
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
