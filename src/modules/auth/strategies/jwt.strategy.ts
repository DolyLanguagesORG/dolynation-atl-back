import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: number;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
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
   * Called by passport-jwt after a token's signature + expiry are valid.
   * Looks up the user in the DB to make sure the account still exists.
   * Throws UnauthorizedException if not — passport will translate that to 401.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.INVALID_TOKEN',
        message: 'User no longer exists',
      });
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? '',
    };
  }
}
