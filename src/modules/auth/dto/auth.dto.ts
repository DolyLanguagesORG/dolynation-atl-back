import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUPPORTED_UI_LOCALES } from '../../../common/types/locale';

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

  @ApiPropertyOptional({
    enum: SUPPORTED_UI_LOCALES,
    default: 'es',
    example: 'es',
    description:
      'Locale de interfaz del usuario. Determina el idioma de los correos transaccionales. Si se omite se usa `es`',
  })
  @IsOptional()
  @IsIn(SUPPORTED_UI_LOCALES)
  locale?: (typeof SUPPORTED_UI_LOCALES)[number];
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

/**
 * DTO de entrada para confirmar el correo electrónico de una cuenta.
 */
export class VerifyEmailDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 512,
    description:
      'Token de confirmación recibido por correo. Es de un solo uso y caduca a las 24 horas',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;
}

/**
 * DTO de entrada para solicitar el restablecimiento de la contraseña.
 */
export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    format: 'email',
    description: 'Correo electrónico de la cuenta',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/**
 * DTO de entrada para reenviar el correo de confirmación de cuenta.
 */
export class ResendVerificationDto {
  @ApiProperty({
    example: 'user@example.com',
    format: 'email',
    description: 'Correo electrónico de la cuenta',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/**
 * DTO de entrada para establecer una nueva contraseña con un token válido.
 */
export class ResetPasswordDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 512,
    description:
      'Token de restablecimiento recibido por correo. Es de un solo uso y caduca a los 60 minutos',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    example: 'myNewSecret123',
    description: 'Nueva contraseña de la cuenta (mínimo 8 caracteres)',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
