import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    format: 'email',
    description: 'Unique email address',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'mySecret123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ minLength: 1, maxLength: 255, example: 'Sebastián Rodríguez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 128, example: 'mySecret123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    minLength: 1,
    description: 'Refresh token issued by /auth/register or /auth/login',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
