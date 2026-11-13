import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * DTO para `PATCH /user/profile` — incluye únicamente campos seguros de modificar.
 * Correo y contraseña quedan excluidos intencionalmente: pertenecen a flujos dedicados
 * con verificación o reautenticación.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Jane Doe',
    minLength: 1,
    maxLength: 255,
    description: 'Nombre visible; se recorta al guardar y no puede estar vacío si se envía',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/\S/, { message: 'fullName must contain at least one non-whitespace character' })
  fullName?: string;
}
