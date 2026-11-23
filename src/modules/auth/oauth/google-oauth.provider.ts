import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { exchangeAuthorizationCodeForIdToken, resolveOidcFullName } from './oauth-oidc.helper';
import type {
  OAuthCodeExchangeParams,
  OAuthProviderAdapter,
  OAuthProviderPublicConfig,
  OAuthVerifiedProfile,
} from './oauth-provider.interface';
import { OidcJwksVerifier } from './oidc-jwks.verifier';

/** Endpoint de autorización OIDC de Google. */
export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
/** Endpoint de Google para intercambiar códigos de autorización por tokens. */
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
/** Endpoint JWKS de Google para verificar firmas de ID tokens. */
export const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
/** Emisores OIDC de Google aceptados al validar el ID token. */
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
/** Scopes mínimos solicitados para identificar al usuario y leer su perfil básico. */
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;

/**
 * Adaptador OAuth 2.0 / OIDC para Google (`Authorization Code + PKCE`).
 */
@Injectable()
export class GoogleOAuthProvider implements OAuthProviderAdapter {
  readonly provider = 'google' as const;

  constructor(
    private readonly config: AppConfigService,
    private readonly jwksVerifier: OidcJwksVerifier,
  ) {}

  /** Devuelve la configuración pública de Google OAuth para el BFF/frontend. */
  getPublicConfig(): OAuthProviderPublicConfig {
    const google = this.config.oauth.google;
    if (!google.enabled || !google.clientId) {
      return {
        provider: this.provider,
        enabled: false,
      };
    }

    return {
      provider: this.provider,
      enabled: true,
      authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
      clientId: google.clientId,
      redirectUri: google.redirectUri,
      scopes: [...GOOGLE_SCOPES],
    };
  }

  /**
   * Intercambia el código de autorización con Google y verifica el ID token OIDC recibido.
   */
  async exchangeCodeForProfile(params: OAuthCodeExchangeParams): Promise<OAuthVerifiedProfile> {
    const google = this.config.oauth.google;
    if (!google.enabled || !google.clientId || !google.clientSecret) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_NOT_CONFIGURED);
    }

    const idToken = await exchangeAuthorizationCodeForIdToken({
      tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      code: params.code,
      codeVerifier: params.codeVerifier,
      redirectUri: params.redirectUri,
      expectedRedirectUri: google.redirectUri,
    });

    const claims = await this.jwksVerifier.verifyIdToken({
      idToken,
      jwksUri: GOOGLE_JWKS_URI,
      expectedIssuers: GOOGLE_ISSUERS,
      expectedAudience: google.clientId,
    });

    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    if (claims.email_verified !== true) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
    }

    return {
      provider: this.provider,
      providerUserId: claims.sub,
      email,
      emailVerified: true,
      fullName: resolveOidcFullName(claims),
    };
  }
}
