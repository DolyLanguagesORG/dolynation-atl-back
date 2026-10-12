import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    format: 'email',
    description: 'Unique email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'mySecret123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Sebastián Rodríguez' })
  @IsString()
  fullName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'mySecret123' })
  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token issued by /auth/login' })
  @IsString()
  refreshToken!: string;
}
