import { Injectable } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthEventLogService } from '../readings/prompt-logs';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import type { IAuthService, AuthTokens, AuthUserView } from './auth.types';

interface JwtPayload {
  sub: number;
  email: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService implements IAuthService {
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly authEventLogs: AuthEventLogService,
  ) {
    this.accessTtl = config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    this.refreshTtl = config.get<string>('JWT_REFRESH_TTL') ?? '30d';
  }

  async register(input: RegisterDto): Promise<{ user: AuthUserView; tokens: AuthTokens }> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new AppHttpException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS, { email: input.email });
    }
    const created = await this.users.create({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
    });
    const tokens = await this.signTokensFor(created.id, created.email);
    await this.authEventLogs.logAuthEvent('user_registered', created.id);
    return { user: this.users.toPublic(created), tokens };
  }

  async login(input: LoginDto): Promise<{ user: AuthUserView; tokens: AuthTokens }> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      throw new AppHttpException(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }
    const ok = await this.users.verifyPassword(input.password, user.password);
    if (!ok) {
      throw new AppHttpException(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }
    const tokens = await this.signTokensFor(user.id, user.email);
    await this.authEventLogs.logAuthEvent('user_login', user.id);
    return { user: this.users.toPublic(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new AppHttpException(ErrorCode.AUTH_TOKEN_INVALID);
    }
    if (payload.type !== 'refresh') {
      throw new AppHttpException(ErrorCode.AUTH_TOKEN_INVALID, { reason: 'wrong_type' });
    }
    return this.signTokensFor(payload.sub, payload.email);
  }

  async logout(_userId: number): Promise<void> {
    // Stateless JWT — logout is a no-op on the server. The mobile client drops the tokens.
    // A future enhancement could maintain a revocation list in Redis.
    return Promise.resolve();
  }

  async me(userId: number): Promise<AuthUserView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppHttpException(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }
    return this.users.toPublic(user);
  }

  private async signTokensFor(userId: number, email: string): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, type: 'access' } satisfies JwtPayload,
      { expiresIn: this.accessTtl as `${number}${'s' | 'm' | 'h' | 'd'}` },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, type: 'refresh' } satisfies JwtPayload,
      { expiresIn: this.refreshTtl as `${number}${'s' | 'm' | 'h' | 'd'}` },
    );
    return { accessToken, refreshToken, expiresIn: 900 };
  }
}
