import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { DEFAULT_UI_LOCALE } from '../../../common/types/locale';
import type { DrizzleDb } from '../../../database/database.module';
import { DRIZZLE } from '../../../database/database.tokens';
import { userOAuthAccounts } from '../../../database/drizzle/schema';
import { AuditLogService, ErrorLogService } from '../../logs';
import { UsersService, type UserWithRole } from '../../users/users.service';
import { AuthService } from '../auth.service';
import type { AuthTokens, AuthUserView } from '../auth.types';
import type { OAuthExchangeDto } from '../dto/auth.dto';
import { GoogleOAuthProvider } from './google-oauth.provider';
import { MicrosoftOAuthProvider } from './microsoft-oauth.provider';
import {
  SUPPORTED_OAUTH_PROVIDERS,
  type OAuthProviderAdapter,
  type OAuthProviderPublicConfig,
  type OAuthVerifiedProfile,
  type SupportedOAuthProvider,
} from './oauth-provider.interface';

/** Resultado devuelto al completar el intercambio OAuth en backend. */
export interface OAuthExchangeResult {
  user: AuthUserView;
  tokens: AuthTokens;
  provider: SupportedOAuthProvider;
  isNewUser: boolean;
  linkedExistingAccount: boolean;
}

/** Comprueba si el identificador recibido pertenece a los proveedores OAuth admitidos. */
function isSupportedProvider(value: string): value is SupportedOAuthProvider {
  return (SUPPORTED_OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** Reconoce errores de unicidad de PostgreSQL, incluso cuando vienen envueltos en `cause`. */
function isPgUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as { code?: unknown; cause?: { code?: unknown } };
  return record.code === '23505' || record.cause?.code === '23505';
}

/**
 * Orquestador multi-proveedor OAuth 2.0 / OIDC para autenticación de estudiantes.
 *
 * Bloquea explícitamente el acceso y auto-vinculación para cuentas con rol `admin`.
 */
@Injectable()
export class AuthOAuthService {
  private readonly logger = new Logger(AuthOAuthService.name);
  private readonly providers: Map<SupportedOAuthProvider, OAuthProviderAdapter>;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    googleProvider: GoogleOAuthProvider,
    microsoftProvider: MicrosoftOAuthProvider,
    @Optional() private readonly auditLogs?: AuditLogService,
    @Optional() private readonly errorLogs?: ErrorLogService,
  ) {
    this.providers = new Map<SupportedOAuthProvider, OAuthProviderAdapter>([
      [googleProvider.provider, googleProvider],
      [microsoftProvider.provider, microsoftProvider],
    ]);
  }

  /** Devuelve los proveedores OAuth registrados y su estado de configuración pública. */
  listProviders(): { providers: OAuthProviderPublicConfig[] } {
    return {
      providers: Array.from(this.providers.values(), (adapter) => adapter.getPublicConfig()),
    };
  }

  /**
   * Valida el código OAuth + PKCE frente al proveedor, resuelve o crea la cuenta
   * estudiantil y emite el par de tokens JWT de sesión.
   */
  async exchangeCode(rawProvider: string, input: OAuthExchangeDto): Promise<OAuthExchangeResult> {
    const normalizedProvider = rawProvider.trim().toLowerCase();
    if (!isSupportedProvider(normalizedProvider)) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_UNSUPPORTED_PROVIDER);
    }

    const adapter = this.providers.get(normalizedProvider);
    if (!adapter) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_UNSUPPORTED_PROVIDER);
    }

    const profile = await this.fetchVerifiedProfile(adapter, input);

    const existingLink = await this.findOAuthLink(profile.provider, profile.providerUserId);
    if (existingLink) {
      return this.loginWithExistingLink(existingLink, profile);
    }

    const existingUser = await this.users.findByEmailInsensitive(profile.email);
    if (existingUser) {
      return this.rejectUnlinkedExistingUser(existingUser, profile);
    }

    return this.createAndLoginOAuthUser(profile, input.locale);
  }

  /** Intercambia el código OAuth y registra fallos del proveedor sin exponerlos al cliente. */
  private async fetchVerifiedProfile(
    adapter: OAuthProviderAdapter,
    input: OAuthExchangeDto,
  ): Promise<OAuthVerifiedProfile> {
    try {
      return await adapter.exchangeCodeForProfile({
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirectUri: input.redirectUri,
      });
    } catch (error) {
      let code: string = ErrorCode.AUTH_OAUTH_PROVIDER_ERROR;
      if (error instanceof AppHttpException) {
        const res = error.getResponse();
        if (typeof res === 'object' && 'code' in res && typeof res.code === 'string') {
          code = res.code;
        }
      }
      if (
        code === String(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR) ||
        !(error instanceof AppHttpException)
      ) {
        const errMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`OAuth exchange failed for ${adapter.provider}: ${errMessage}`);
        await this.errorLogs?.logError({
          severity: 'error',
          source: 'oauth',
          module: 'auth',
          errorCode: code,
          message: `OAuth provider exchange failed (${adapter.provider}): ${errMessage}`,
          errorName: error instanceof Error ? error.name : typeof error,
          errorStack: error instanceof Error ? (error.stack ?? null) : null,
          details: { provider: adapter.provider },
        });
      }
      throw error;
    }
  }

  /** Busca la cuenta local vinculada a la identidad del proveedor. */
  private async findOAuthLink(
    provider: SupportedOAuthProvider,
    providerUserId: string,
  ): Promise<typeof userOAuthAccounts.$inferSelect | null> {
    const rows = await this.db
      .select()
      .from(userOAuthAccounts)
      .where(
        and(
          eq(userOAuthAccounts.provider, provider),
          eq(userOAuthAccounts.providerUserId, providerUserId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Rechaza cuentas eliminadas o administrativas antes de completar el inicio de sesión OAuth. */
  private async assertNotAdminOrDeleted(
    user: UserWithRole | null,
    provider: SupportedOAuthProvider,
  ): Promise<UserWithRole> {
    if (user?.deletedAt !== null) {
      throw new AppHttpException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    if (user.role === 'admin') {
      await this.auditLogs?.logEvent({
        module: 'auth',
        action: 'AUTH',
        event: 'auth.oauth_admin_blocked',
        entityType: 'users',
        entityId: user.id,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        targetUserId: user.id,
        summary: `Blocked OAuth sign-in attempt for administrator account (${user.email})`,
        metadata: { provider },
      });
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_ADMIN_FORBIDDEN);
    }

    return user;
  }

  /** Marca el correo como verificado y devuelve el perfil actualizado de la cuenta. */
  private async ensureEmailVerified(user: UserWithRole): Promise<UserWithRole> {
    if (user.emailVerifiedAt) {
      return user;
    }
    await this.users.markEmailVerified(user.id);
    return (await this.users.findById(user.id)) ?? { ...user, emailVerifiedAt: new Date() };
  }

  /** Emite una sesión para una identidad OAuth que ya está vinculada a una cuenta local. */
  private async loginWithExistingLink(
    link: typeof userOAuthAccounts.$inferSelect,
    profile: OAuthVerifiedProfile,
  ): Promise<OAuthExchangeResult> {
    const foundUser = await this.users.findById(link.userId);
    const activeUser = await this.assertNotAdminOrDeleted(foundUser, profile.provider);

    if (link.providerEmail !== profile.email) {
      await this.db
        .update(userOAuthAccounts)
        .set({ providerEmail: profile.email, updatedAt: new Date() })
        .where(eq(userOAuthAccounts.id, link.id));
    }

    const verifiedUser = await this.ensureEmailVerified(activeUser);
    const session = await this.auth.issueOAuthSession(verifiedUser, {
      provider: profile.provider,
      event: 'auth.oauth_login',
      isNewUser: false,
      linkedExistingAccount: false,
    });

    return {
      ...session,
      provider: profile.provider,
      isNewUser: false,
      linkedExistingAccount: false,
    };
  }

  /** Rechaza OAuth sobre una cuenta local que todavía no tiene el proveedor vinculado explícitamente. */
  private async rejectUnlinkedExistingUser(
    existingUser: UserWithRole,
    profile: OAuthVerifiedProfile,
  ): Promise<OAuthExchangeResult> {
    const activeUser = await this.assertNotAdminOrDeleted(existingUser, profile.provider);
    await this.auditLogs?.logEvent({
      module: 'auth',
      action: 'AUTH',
      event: 'auth.oauth_link_required',
      entityType: 'users',
      entityId: activeUser.id,
      actorUserId: activeUser.id,
      actorEmail: activeUser.email,
      actorRole: activeUser.role,
      targetUserId: activeUser.id,
      summary: `OAuth sign-in rejected for existing account #${activeUser.id}; provider link is required`,
      metadata: { provider: profile.provider, reason: 'existing_account_unlinked' },
    });
    throw new AppHttpException(ErrorCode.AUTH_OAUTH_ACCOUNT_LINK_REQUIRED);
  }

  /** Crea una cuenta verificada por el proveedor y recupera carreras de registro por correo único. */
  private async createAndLoginOAuthUser(
    profile: OAuthVerifiedProfile,
    locale?: string,
  ): Promise<OAuthExchangeResult> {
    const now = new Date();
    let createdUser: UserWithRole;

    try {
      createdUser = await this.users.createOAuthUser({
        email: profile.email,
        fullName: profile.fullName,
        locale: locale ?? DEFAULT_UI_LOCALE,
        emailVerifiedAt: now,
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        const racedUser = await this.users.findByEmailInsensitive(profile.email);
        if (racedUser) {
          return this.rejectUnlinkedExistingUser(racedUser, profile);
        }
      }
      throw error;
    }

    await this.persistOAuthLinkOrVerifyRace(createdUser.id, profile);

    const session = await this.auth.issueOAuthSession(createdUser, {
      provider: profile.provider,
      event: 'auth.oauth_registered',
      isNewUser: true,
      linkedExistingAccount: false,
    });

    return {
      ...session,
      provider: profile.provider,
      isNewUser: true,
      linkedExistingAccount: false,
    };
  }

  /** Persiste la identidad y acepta una carrera solo si ya pertenece al mismo usuario. */
  private async persistOAuthLinkOrVerifyRace(
    userId: number,
    profile: OAuthVerifiedProfile,
  ): Promise<void> {
    const now = new Date();
    try {
      await this.db.insert(userOAuthAccounts).values({
        userId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        providerEmail: profile.email,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (!isPgUniqueViolation(error)) {
        throw error;
      }

      // Si hubo carrera entre dos requests idénticas, validamos que la identidad siga perteneciendo al mismo usuario.
      const racedLink = await this.findOAuthLink(profile.provider, profile.providerUserId);
      if (racedLink?.userId === userId) {
        return;
      }

      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }
  }
}
