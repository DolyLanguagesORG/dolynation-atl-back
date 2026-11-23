import { Injectable } from '@nestjs/common';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AppConfigService } from '../../../config/env.config';
import { exchangeAuthorizationCodeForIdToken, resolveOidcFullName } from './oauth-oidc.helper';
import type {
  OAuthCodeExchangeParams,
  OAuthProviderAdapter,
  OAuthProviderPublicConfig,
  OAuthVerifiedProfile,
} from './oauth-provider.interface';
import { OidcJwksVerifier, type OidcIdTokenPayload } from './oidc-jwks.verifier';

export const MICROSOFT_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';
export const MICROSOFT_SCOPES = ['openid', 'email', 'profile'] as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** URL base de autorización OAuth 2.0 v2.0 para el tenant de Microsoft Entra ID configurado. */
export function getMicrosoftAuthorizationEndpoint(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
}

/** URL de intercambio de tokens OAuth 2.0 v2.0 para el tenant configurado. */
export function getMicrosoftTokenEndpoint(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

/** URL del conjunto de llaves públicas JWKS OIDC v2.0 para el tenant configurado. */
export function getMicrosoftJwksUri(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`;
}

function isAllowedTenantIssuer(
  configuredTenant: string,
  iss: string,
  payload: Record<string, unknown>,
): boolean {
  const rawTid = typeof payload['tid'] === 'string' ? payload['tid'].trim() : '';
  if (!UUID_REGEX.test(rawTid)) {
    return false;
  }

  const normalizedTid = rawTid.toLowerCase();
  const expectedIssuer = `https://login.microsoftonline.com/${rawTid}/v2.0`;
  const normalizedExpectedIssuer = `https://login.microsoftonline.com/${normalizedTid}/v2.0`;
  if (iss !== expectedIssuer && iss !== normalizedExpectedIssuer) {
    return false;
  }

  const tenantPolicy = configuredTenant.toLowerCase();
  if (tenantPolicy === 'common') {
    return true;
  }
  if (tenantPolicy === 'consumers') {
    return normalizedTid === MICROSOFT_CONSUMER_TENANT_ID;
  }
  if (tenantPolicy === 'organizations') {
    return normalizedTid !== MICROSOFT_CONSUMER_TENANT_ID;
  }
  return normalizedTid === tenantPolicy;
}

function resolveVerifiedMicrosoftEmail(claims: OidcIdTokenPayload): string {
  if (claims.email_verified === false) {
    throw new AppHttpException(ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
  }

  if (
    claims.xms_edov === false ||
    claims.xms_edov === 0 ||
    claims.xms_edov === '0' ||
    claims.xms_edov === 'false'
  ) {
    throw new AppHttpException(ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
  }

  const explicitEmail = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  const preferredUsername =
    typeof claims.preferred_username === 'string'
      ? claims.preferred_username.trim().toLowerCase()
      : '';

  const candidateEmail =
    explicitEmail.length > 0
      ? explicitEmail
      : EMAIL_FORMAT_REGEX.test(preferredUsername)
        ? preferredUsername
        : '';

  if (!candidateEmail) {
    throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
  }

  // Las cuentas invitadas B2B externas suelen emitir un UPN sintético `#ext#` en vez de un correo directo.
  if (candidateEmail.includes('#ext#') || !EMAIL_FORMAT_REGEX.test(candidateEmail)) {
    throw new AppHttpException(ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
  }

  return candidateEmail;
}

/**
 * Adaptador OAuth 2.0 / OIDC para Microsoft Entra ID v2.0 (`Authorization Code + PKCE`).
 */
@Injectable()
export class MicrosoftOAuthProvider implements OAuthProviderAdapter {
  readonly provider = 'microsoft' as const;

  constructor(
    private readonly config: AppConfigService,
    private readonly jwksVerifier: OidcJwksVerifier,
  ) {}

  /** Devuelve la configuración pública de Microsoft OAuth para el BFF/frontend. */
  getPublicConfig(): OAuthProviderPublicConfig {
    const microsoft = this.config.oauth.microsoft;
    if (!microsoft.enabled || !microsoft.clientId) {
      return {
        provider: this.provider,
        enabled: false,
      };
    }

    return {
      provider: this.provider,
      enabled: true,
      authorizationEndpoint: getMicrosoftAuthorizationEndpoint(microsoft.tenant),
      clientId: microsoft.clientId,
      redirectUri: microsoft.redirectUri,
      scopes: [...MICROSOFT_SCOPES],
    };
  }

  /**
   * Intercambia el código de autorización con Entra ID v2.0 y verifica el ID token multitenant.
   */
  async exchangeCodeForProfile(params: OAuthCodeExchangeParams): Promise<OAuthVerifiedProfile> {
    const microsoft = this.config.oauth.microsoft;
    if (!microsoft.enabled || !microsoft.clientId || !microsoft.clientSecret) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_NOT_CONFIGURED);
    }

    const idToken = await exchangeAuthorizationCodeForIdToken({
      tokenEndpoint: getMicrosoftTokenEndpoint(microsoft.tenant),
      clientId: microsoft.clientId,
      clientSecret: microsoft.clientSecret,
      code: params.code,
      codeVerifier: params.codeVerifier,
      redirectUri: params.redirectUri,
      expectedRedirectUri: microsoft.redirectUri,
    });

    const claims = await this.jwksVerifier.verifyIdToken({
      idToken,
      jwksUri: getMicrosoftJwksUri(microsoft.tenant),
      expectedAudience: microsoft.clientId,
      issuerValidator: (iss, payload) => isAllowedTenantIssuer(microsoft.tenant, iss, payload),
    });

    const email = resolveVerifiedMicrosoftEmail(claims);

    return {
      provider: this.provider,
      providerUserId: claims.sub,
      email,
      emailVerified: true,
      fullName: resolveOidcFullName(claims),
    };
  }
}
