import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { ReadingsModule } from '../readings/readings.module';
import { MailModule } from '../mail/mail.module';
import { AuthEmailTokenService } from './auth-email-token.service';
import { AuthOAuthService } from './oauth/auth-oauth.service';
import { GoogleOAuthProvider } from './oauth/google-oauth.provider';
import { MicrosoftOAuthProvider } from './oauth/microsoft-oauth.provider';
import { OidcJwksVerifier } from './oauth/oidc-jwks.verifier';
import type { EnvSchema } from '../../config/env.validation';

/**
 * Módulo de autenticación y gestión de sesiones JWT.
 * Configura Passport y JwtModule con el secreto y tiempo de expiración desde las variables de entorno.
 */
@Module({
  imports: [
    UsersModule,
    ReadingsModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvSchema, true>) => {
        const secret = config.get('JWT_SECRET', { infer: true });
        if (!secret) throw new Error('JWT_SECRET is not configured');
        return {
          secret,
          signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthEmailTokenService,
    JwtStrategy,
    OidcJwksVerifier,
    GoogleOAuthProvider,
    MicrosoftOAuthProvider,
    AuthOAuthService,
  ],
  exports: [AuthService, AuthOAuthService],
})
export class AuthModule {}
