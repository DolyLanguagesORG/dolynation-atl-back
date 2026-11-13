import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO de entrada para registrar una nueva cuenta de usuario.
 */
export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    format: 'email',
    description: 'Dirección de correo electrónico única',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    example: 'mySecret123',
    description: 'Contraseña de la cuenta (mínimo 8 caracteres)',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 255,
    example: 'Sebastián Rodríguez',
    description: 'Nombre completo del usuario',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName!: string;
}

/**
 * DTO de entrada para iniciar sesión con correo y contraseña.
 */
export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    format: 'email',
    description: 'Correo electrónico registrado',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 128,
    example: 'mySecret123',
    description: 'Contraseña de acceso',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

/**
 * DTO de entrada para renovar o revocar una sesión mediante refresh token.
 */
export class RefreshTokenDto {
  @ApiProperty({
    minLength: 1,
    description: 'Token de actualización (refresh token) emitido por /auth/register o /auth/login',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
