import { Inject, Injectable } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthEventLogService } from '../readings/prompt-logs';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { createHash, randomUUID } from 'node:crypto';
import { DRIZZLE } from '../../database/database.tokens';
import { authAccessTokens } from '../../database/drizzle/schema';
import type { DrizzleDb } from '../../database/database.module';
import type { IAuthService, AuthTokens, AuthUserView } from './auth.types';
import { and, eq, gt, isNull } from 'drizzle-orm';

/** Carga útil codificada dentro de los tokens JWT de acceso y refresco. */
interface JwtPayload {
  sub: number;
  email: string;
  type: 'access' | 'refresh';
  jti?: string;
}

/**
 * Convierte una cadena de duración corta (ej. `5m`, `30d`) a milisegundos.
 */
function ttlToMilliseconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    throw new Error('JWT TTL must use seconds, minutes, hours, or days');
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return amount * 1_000;
    case 'm':
      return amount * 60_000;
    case 'h':
      return amount * 3_600_000;
    case 'd':
      return amount * 86_400_000;
    default:
      throw new Error('Unsupported JWT_REFRESH_TTL unit');
  }
}

/**
 * Servicio responsable del registro, inicio de sesión, rotación de refresh tokens
 * y cierre de sesión de usuarios.
 */
@Injectable()
export class AuthService implements IAuthService {
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    config: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly authEventLogs: AuthEventLogService,
  ) {
    this.accessTtl = config.get<string>('JWT_ACCESS_TTL') ?? '5m';
    this.refreshTtl = config.get<string>('JWT_REFRESH_TTL') ?? '30d';
  }

  /**
   * Registra un usuario nuevo, emite sus tokens iniciales y registra el evento de auditoría.
   */
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

  /**
   * Valida correo y contraseña y devuelve el perfil público junto con los tokens JWT.
   */
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

  /**
   * Verifica un refresh token válido, lo revoca de forma atómica (un solo uso)
   * y emite un nuevo par de tokens.
   */
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
    // Buscamos el hash SHA-256 del token para comprobar que sigue activo y sin expirar.
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const now = new Date();
    const [storedToken] = await this.db
      .select()
      .from(authAccessTokens)
      .where(
        and(
          eq(authAccessTokens.tokenableId, payload.sub),
          eq(authAccessTokens.type, 'refresh'),
          eq(authAccessTokens.hash, tokenHash),
          isNull(authAccessTokens.deletedAt),
          gt(authAccessTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (!storedToken) {
      throw new AppHttpException(ErrorCode.AUTH_TOKEN_INVALID);
    }

    // Revocación atómica para impedir la reutilización concurrente del mismo refresh token.
    const [revokedToken] = await this.db
      .update(authAccessTokens)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(authAccessTokens.id, storedToken.id),
          isNull(authAccessTokens.deletedAt),
          gt(authAccessTokens.expiresAt, now),
        ),
      )
      .returning({ id: authAccessTokens.id });

    if (!revokedToken) {
      throw new AppHttpException(ErrorCode.AUTH_TOKEN_INVALID);
    }
    return this.signTokensFor(payload.sub, payload.email);
  }

  /**
   * Cierra la sesión actual revocando en base de datos el refresh token recibido.
   */
  async logout(userId: number, refreshToken: string): Promise<void> {
    const now = new Date();
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.db
      .update(authAccessTokens)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(authAccessTokens.tokenableId, userId),
          eq(authAccessTokens.type, 'refresh'),
          eq(authAccessTokens.hash, tokenHash),
          isNull(authAccessTokens.deletedAt),
          gt(authAccessTokens.expiresAt, now),
        ),
      );
  }

  /**
   * Cierra todas las sesiones activas del usuario revocando todos sus refresh tokens.
   */
  async logoutAll(userId: number): Promise<void> {
    const now = new Date();

    await this.db
      .update(authAccessTokens)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(authAccessTokens.tokenableId, userId),
          eq(authAccessTokens.type, 'refresh'),
          isNull(authAccessTokens.deletedAt),
          gt(authAccessTokens.expiresAt, now),
        ),
      );
  }

  /**
   * Devuelve el perfil público del usuario autenticado actual.
   */
  async me(userId: number): Promise<AuthUserView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppHttpException(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }
    return this.users.toPublic(user);
  }

  /**
   * Firma el par access/refresh token y almacena el hash del refresh token para rotación.
   */
  private async signTokensFor(userId: number, email: string): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, type: 'access' } satisfies JwtPayload,
      { expiresIn: this.accessTtl as `${number}${'s' | 'm' | 'h' | 'd'}` },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, type: 'refresh', jti: randomUUID() } satisfies JwtPayload,
      { expiresIn: this.refreshTtl as `${number}${'s' | 'm' | 'h' | 'd'}` },
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlToMilliseconds(this.refreshTtl));

    await this.db.insert(authAccessTokens).values({
      tokenableId: userId,
      type: 'refresh',
      hash: createHash('sha256').update(refreshToken).digest('hex'),
      abilities: JSON.stringify(['refresh']),
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(ttlToMilliseconds(this.accessTtl) / 1_000),
    };
  }
}
