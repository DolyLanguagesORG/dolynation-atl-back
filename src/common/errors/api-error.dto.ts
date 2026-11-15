import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

/**
 * Documentado en OpenAPI. Representa un error de validación por campo dentro de
 * `ApiErrorDto.details.fields`.
 */
export class ValidationFieldErrorDto {
  @ApiProperty({
    description: 'Nombre del campo en el cuerpo de la petición, o "_root" para errores generales',
    example: 'email',
  })
  field!: string;

  @ApiProperty({
    description: 'Mensaje legible del error para este campo',
    example: 'must be a valid email',
  })
  message!: string;
}

/**
 * Forma del campo `error` dentro de cualquier sobre de error de la API.
 * Se utiliza como tipo en los decoradores `@ApiResponse({ type: ApiErrorDto })`.
 *
 * El sobre completo (con `message` y `data: null`) comparte estructura con el
 * sobre de éxito, evitando crear clases envoltorio separadas que generaban
 * dependencias circulares en el generador de esquemas OpenAPI.
 */
export class ApiErrorDto {
  @ApiProperty({
    description: 'Código estable legible por máquina (consultar el enum ErrorCode)',
    example: 'RESOURCE_NOT_FOUND',
  })
  code!: string;

  @ApiProperty({
    description: 'Mensaje de error legible y seguro para mostrar al usuario final',
    example: 'The requested resource was not found',
  })
  message!: string;

  @ApiProperty({
    required: false,
    description:
      'Contexto adicional opcional. Para VALIDATION_ERROR incluye un arreglo `fields` de objetos { field, message }.',
    type: Object,
    additionalProperties: true,
    example: { fields: [{ field: 'email', message: 'must be a valid email' }] },
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
