import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { OidcIdTokenPayload } from './oidc-jwks.verifier';

const DEFAULT_OAUTH_TIMEOUT_MS = 15_000;
const INVALID_CODE_OAUTH_ERRORS = new Set([
  'invalid_grant',
  'invalid_request',
  'redirect_uri_mismatch',
]);

/** Parámetros comunes para canjear Authorization Code + PKCE por un `id_token` OIDC. */
export interface OAuthTokenExchangeInput {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  expectedRedirectUri: string;
  timeoutMs?: number;
}

/**
 * Ejecuta el intercambio Authorization Code + PKCE en el token endpoint OIDC
 * y extrae el `id_token` devuelto por el proveedor.
 */
export async function exchangeAuthorizationCodeForIdToken(
  input: OAuthTokenExchangeInput,
): Promise<string> {
  if (input.redirectUri !== input.expectedRedirectUri) {
    throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
  }

  const formBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetch(input.tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_OAUTH_TIMEOUT_MS),
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

  return idToken;
}

/** Normaliza el nombre completo desde los claims OIDC estándar `name`, `given_name` y `family_name`. */
export function resolveOidcFullName(
  claims: Pick<OidcIdTokenPayload, 'name' | 'given_name' | 'family_name'>,
): string | null {
  const combinedParts = [claims.given_name?.trim(), claims.family_name?.trim()]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(' ');
  const explicitName = claims.name?.trim() ?? '';
  const resolvedName = explicitName.length > 0 ? explicitName : combinedParts;
  return resolvedName.length > 0 ? resolvedName.slice(0, 255) : null;
}
