import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../config/env.config';
import { UsersService } from '../users/users.service';
import { AuthEventLogService } from '../readings/prompt-logs';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { createHash, randomUUID } from 'node:crypto';
import { DRIZZLE } from '../../database/database.tokens';
import { authAccessTokens } from '../../database/drizzle/schema';
import type { DrizzleDb } from '../../database/database.module';
import type { User } from '../../database/drizzle/types';
import type { IAuthService, AuthTokens, AuthUserView, RegisterResult } from './auth.types';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AuthEmailTokenService } from './auth-email-token.service';
import { MailService } from '../mail/mail.service';
import { describeError } from '../mail/mail.errors';
import { isMailLocale, type MailLocale } from '../mail/mail.types';
import {
  EMAIL_TOKEN_TYPE_PASSWORD_RESET,
  EMAIL_TOKEN_TYPE_VERIFICATION,
  EMAIL_VERIFICATION_TTL_MINUTES,
  FORGOT_PASSWORD_THROTTLE_MAX_REQUESTS,
  FORGOT_PASSWORD_THROTTLE_WINDOW_MS,
  PASSWORD_RESET_TTL_MINUTES,
} from '../mail/mail.constants';
import { DEFAULT_UI_LOCALE } from '../../common/types/locale';

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
 * Servicio responsable del registro, inicio de sesión, rotación de refresh tokens,
 * cierre de sesión de usuarios y de los flujos de correo de cuenta
 * (confirmación de correo y restablecimiento de contraseña).
 */
@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtl: string;
  private readonly refreshTtl: string;
  /**
   * Intentos recientes de envío de correo por dirección, indexados por
   * `<flujo>:<correo normalizado>`. Es un límite *best effort* en memoria:
   * no sobrevive a un reinicio ni se comparte entre instancias.
   */
  private readonly mailAttempts = new Map<string, number[]>();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly authEventLogs: AuthEventLogService,
    private readonly mail: MailService,
    private readonly emailTokens: AuthEmailTokenService,
  ) {
    this.accessTtl = config.jwt.accessTtl;
    this.refreshTtl = config.jwt.refreshTtl;
  }

  /**
   * Registra un usuario nuevo, emite sus tokens iniciales, registra el evento de
   * auditoría y envía el correo de confirmación de cuenta.
   *
   * Cuando `EMAIL_VERIFICATION_REQUIRED` está activo no se emiten tokens: la
   * cuenta queda pendiente de confirmar y el cliente debe usar
   * `POST /auth/verify-email` antes de poder iniciar sesión.
   */
  async register(input: RegisterDto): Promise<RegisterResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new AppHttpException(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS, { email: input.email });
    }
    const created = await this.users.create({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      locale: input.locale ?? DEFAULT_UI_LOCALE,
    });

    const verificationRequired = this.config.mail.verificationRequired;
    const tokens = verificationRequired
      ? null
      : await this.signTokensFor(created.id, created.email);

    await this.authEventLogs.logAuthEvent('user_registered', created.id);

    // Un fallo del proveedor de correo no debe invalidar el alta: la cuenta
    // existe y el usuario puede pedir un reenvío con
    // `POST /auth/resend-verification`.
    await this.sendAccountConfirmationEmail(created);

    return {
      user: this.users.toPublic(created),
      tokens,
      emailVerificationRequired: verificationRequired,
    };
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
    this.assertEmailVerified(user);
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

    // Con la verificación de correo activa, una cuenta sin confirmar no puede
    // renovar su sesión.
    if (this.config.mail.verificationRequired) {
      const user = await this.users.findById(payload.sub);
      if (!user) {
        throw new AppHttpException(ErrorCode.AUTH_TOKEN_INVALID);
      }
      this.assertEmailVerified(user);
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
   * Confirma el correo de una cuenta consumiendo el token recibido por correo.
   *
   * @throws {AppHttpException} `AUTH_EMAIL_TOKEN_INVALID` si el token no existe,
   *         ha expirado o ya se usó.
   */
  async verifyEmail(
    token: string,
  ): Promise<{ emailVerified: boolean; user: AuthUserView; tokens: AuthTokens }> {
    const consumed = await this.emailTokens.consume(token, EMAIL_TOKEN_TYPE_VERIFICATION);
    if (!consumed) {
      throw new AppHttpException(ErrorCode.AUTH_EMAIL_TOKEN_INVALID);
    }
    await this.users.markEmailVerified(consumed.userId);
    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw new AppHttpException(ErrorCode.AUTH_UNAUTHORIZED);
    }
    const tokens = await this.signTokensFor(user.id, user.email);
    await this.authEventLogs.logAuthEvent('user_login', user.id);
    return {
      emailVerified: true,
      user: this.users.toPublic(user),
      tokens,
    };
  }

  /**
   * Envía el correo de restablecimiento de contraseña.
   *
   * La respuesta es **siempre la misma** exista o no la cuenta, para no
   * permitir enumerar qué correos están registrados. Solo se envía correo a
   * cuentas existentes.
   */
  async forgotPassword(email: string): Promise<{ emailSent: boolean }> {
    const normalized = normalizeEmail(email);
    if (!this.registerMailAttempt(`forgot:${normalized}`)) {
      // Límite alcanzado: se responde igual y en silencio para no filtrar información.
      return { emailSent: true };
    }

    const user = await this.users.findByEmail(normalized);
    if (!user) {
      return { emailSent: true };
    }

    try {
      const token = await this.emailTokens.issue({
        userId: user.id,
        type: EMAIL_TOKEN_TYPE_PASSWORD_RESET,
        ttlMinutes: PASSWORD_RESET_TTL_MINUTES,
      });
      await this.mail.sendPasswordReset({
        to: user.email,
        fullName: user.fullName,
        token,
        locale: resolveLocale(user.locale),
      });
    } catch (error) {
      this.logger.error(`No se pudo enviar el correo de restablecimiento: ${describeError(error)}`);
    }

    return { emailSent: true };
  }

  /**
   * Reenvía el correo de confirmación de cuenta si esta sigue sin verificarse.
   *
   * La respuesta es siempre la misma, exista o no la cuenta.
   */
  async resendVerification(email: string): Promise<{ emailSent: boolean }> {
    const normalized = normalizeEmail(email);
    if (!this.registerMailAttempt(`resend:${normalized}`)) {
      return { emailSent: true };
    }

    const user = await this.users.findByEmail(normalized);
    // `user?.emailVerifiedAt !== null` cubre los tres casos: la cuenta no
    // existe (`undefined`), la cuenta ya está verificada o la que no lo está.
    if (user?.emailVerifiedAt !== null) {
      return { emailSent: true };
    }

    await this.sendAccountConfirmationEmail(user);
    return { emailSent: true };
  }

  /**
   * Establece una nueva contraseña consumiendo un token de restablecimiento válido.
   *
   * Revoca además todas las sesiones activas de la cuenta, de modo que un
   * cambio de contraseña cierre el acceso en los demás dispositivos.
   */
  async resetPassword(token: string, password: string): Promise<{ passwordUpdated: boolean }> {
    const consumed = await this.emailTokens.consume(token, EMAIL_TOKEN_TYPE_PASSWORD_RESET);
    if (!consumed) {
      throw new AppHttpException(ErrorCode.AUTH_EMAIL_TOKEN_INVALID);
    }

    await this.users.updatePassword(consumed.userId, password);
    await this.logoutAll(consumed.userId);
    await this.emailTokens.revokeActive(consumed.userId, EMAIL_TOKEN_TYPE_PASSWORD_RESET);

    return { passwordUpdated: true };
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

  /**
   * Emite el token de verificación y envía el correo de confirmación.
   *
   * Nunca propaga el fallo: el alta y el reenvío deben sobrevivir a un problema
   * puntual del proveedor de correo.
   */
  private async sendAccountConfirmationEmail(user: User): Promise<void> {
    try {
      const token = await this.emailTokens.issue({
        userId: user.id,
        type: EMAIL_TOKEN_TYPE_VERIFICATION,
        ttlMinutes: EMAIL_VERIFICATION_TTL_MINUTES,
      });
      await this.mail.sendAccountConfirmation({
        to: user.email,
        fullName: user.fullName,
        token,
        locale: resolveLocale(user.locale),
      });
    } catch (error) {
      this.logger.error(`No se pudo enviar el correo de confirmación: ${describeError(error)}`);
    }
  }

  /**
   * Impide el acceso a cuentas cuyo correo no está confirmado cuando
   * `EMAIL_VERIFICATION_REQUIRED` está activo.
   */
  private assertEmailVerified(user: Pick<User, 'emailVerifiedAt'>): void {
    if (!this.config.mail.verificationRequired) {
      return;
    }
    if (user.emailVerifiedAt === null || user.emailVerifiedAt === undefined) {
      throw new AppHttpException(ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
    }
  }

  /**
   * Registra un intento de envío de correo y decide si está dentro del límite.
   *
   * @returns `true` si la petición debe atenderse, `false` si se ha superado el
   *          límite de la ventana temporal.
   */
  private registerMailAttempt(key: string): boolean {
    const now = Date.now();
    const windowStart = now - FORGOT_PASSWORD_THROTTLE_WINDOW_MS;
    const attempts = (this.mailAttempts.get(key) ?? []).filter((at) => at > windowStart);
    attempts.push(now);
    this.mailAttempts.set(key, attempts);
    this.pruneMailAttempts(windowStart);
    return attempts.length <= FORGOT_PASSWORD_THROTTLE_MAX_REQUESTS;
  }

  /** Elimina las entradas caducadas para que el mapa no crezca sin límite. */
  private pruneMailAttempts(windowStart: number): void {
    if (this.mailAttempts.size <= 1000) {
      return;
    }
    for (const [key, attempts] of this.mailAttempts) {
      if (attempts.every((at) => at <= windowStart)) {
        this.mailAttempts.delete(key);
      }
    }
  }
}

/** Normaliza un correo para comparar y para usarlo como clave de búsqueda. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Resuelve el locale guardado en la cuenta al locale de las plantillas. */
function resolveLocale(locale: string | null | undefined): MailLocale {
  return isMailLocale(locale) ? locale : DEFAULT_UI_LOCALE;
}
