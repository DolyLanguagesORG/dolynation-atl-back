import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type {
  OAuthCodeExchangeParams,
  OAuthProviderAdapter,
  OAuthProviderPublicConfig,
  OAuthVerifiedProfile,
} from './oauth-provider.interface';
import { OidcJwksVerifier } from './oidc-jwks.verifier';

export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;

const GOOGLE_OAUTH_TIMEOUT_MS = 15_000;
const INVALID_CODE_OAUTH_ERRORS = new Set([
  'invalid_grant',
  'invalid_request',
  'redirect_uri_mismatch',
]);

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

    if (params.redirectUri !== google.redirectUri) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    const formBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    });

    let response: Response;
    try {
      response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: formBody.toString(),
        signal: AbortSignal.timeout(GOOGLE_OAUTH_TIMEOUT_MS),
      });
    } catch {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    let rawBody: unknown;
    try {
      rawBody = await response.json();
    } catch {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    const body =
      typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {};

    if (!response.ok) {
      const oauthError = typeof body['error'] === 'string' ? body['error'].trim() : '';
      if (response.status === 400 && INVALID_CODE_OAUTH_ERRORS.has(oauthError)) {
        throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
      }
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    const idToken = typeof body['id_token'] === 'string' ? body['id_token'].trim() : '';
    if (!idToken) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

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

    const combinedParts = [claims.given_name?.trim(), claims.family_name?.trim()]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join(' ');
    const explicitName = claims.name?.trim() ?? '';
    const resolvedName = explicitName.length > 0 ? explicitName : combinedParts;
    const fullName = resolvedName.length > 0 ? resolvedName.slice(0, 255) : null;

    return {
      provider: this.provider,
      providerUserId: claims.sub,
      email,
      emailVerified: true,
      fullName,
    };
  }
}
