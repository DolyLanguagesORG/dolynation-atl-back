import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { AppConfigService } from '../../../config/env.config';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

/** Carga útil esperada dentro del token JWT. */
export interface JwtPayload {
  sub: number;
  email: string;
  type: 'access' | 'refresh';
}

/**
 * Estrategia de Passport encargada de validar los tokens Bearer de acceso en cada petición.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly appConfig: AppConfigService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Invocado por `passport-jwt` después de verificar firma y expiración del token.
   * Comprueba que sea un token de acceso y que el usuario siga existiendo en la base de datos.
   * Lanza `UnauthorizedException` en caso contrario (Passport lo traduce a HTTP 401).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException({
        code: 'AUTH.INVALID_TOKEN',
        message: 'Access token required',
      });
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.INVALID_TOKEN',
        message: 'User no longer exists',
      });
    }

    // Con la verificación de correo activa, un token emitido antes de confirmar
    // el correo deja de ser válido.
    if (this.appConfig.mail.verificationRequired && !user.emailVerifiedAt) {
      throw new AppHttpException(ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? '',
    };
  }
}
