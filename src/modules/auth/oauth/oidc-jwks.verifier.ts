import { Injectable } from '@nestjs/common';
import { createPublicKey, verify as verifySignature, type webcrypto } from 'node:crypto';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

/** Parámetros para verificar un ID token OIDC firmado con RS256 usando JWKS. */
export interface VerifyOidcIdTokenParams {
  idToken: string;
  jwksUri: string;
  expectedIssuers: readonly string[];
  expectedAudience: string;
  clockToleranceSec?: number;
}

/** Claims mínimos verificados extraídos de un ID token OIDC. */
export interface OidcIdTokenPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
}

interface RsaJwk extends webcrypto.JsonWebKey {
  kid: string;
  kty: 'RSA';
  n: string;
  e: string;
}

interface CachedJwks {
  keys: RsaJwk[];
  expiresAtMs: number;
}

const JWKS_FETCH_TIMEOUT_MS = 10_000;
const MIN_CACHE_TTL_SEC = 60;
const DEFAULT_CACHE_TTL_SEC = 3_600;
const MAX_CACHE_TTL_SEC = 86_400;
const DEFAULT_CLOCK_TOLERANCE_SEC = 60;

/**
 * Verificador criptográfico de ID tokens OIDC (RS256) basado en Node `crypto` y caché JWKS.
 */
@Injectable()
export class OidcJwksVerifier {
  private readonly jwksCache = new Map<string, CachedJwks>();

  /**
   * Valida la firma RS256 y los claims estándar (`iss`, `aud`, `exp`, `nbf`, `sub`) de un ID token OIDC.
   */
  async verifyIdToken(params: VerifyOidcIdTokenParams): Promise<OidcIdTokenPayload> {
    const parts = params.idToken.split('.');
    if (parts.length !== 3) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    const header = parseJwtSegment(headerB64);
    if (header?.['alg'] !== 'RS256') {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    const kid = typeof header['kid'] === 'string' ? header['kid'].trim() : '';
    if (!kid) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    const jwk = await this.resolveSigningKey(params.jwksUri, kid);
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
    const signature = Buffer.from(signatureB64, 'base64url');

    let signatureValid = false;
    try {
      const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
      signatureValid = verifySignature('RSA-SHA256', signingInput, publicKey, signature);
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    const payload = parseJwtSegment(payloadB64);
    if (!payload) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    return this.validatePayloadClaims(payload, params);
  }

  private async resolveSigningKey(jwksUri: string, kid: string): Promise<RsaJwk> {
    const initialKeys = await this.getJwks(jwksUri, false);
    const cachedMatch = initialKeys.find((key) => key.kid === kid);
    if (cachedMatch) {
      return cachedMatch;
    }

    // Si Google/Microsoft rotó llaves recientemente, refrescamos una vez antes de rechazar.
    const refreshedKeys = await this.getJwks(jwksUri, true);
    const refreshedMatch = refreshedKeys.find((key) => key.kid === kid);
    if (!refreshedMatch) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }
    return refreshedMatch;
  }

  private async getJwks(jwksUri: string, forceRefresh: boolean): Promise<RsaJwk[]> {
    const nowMs = Date.now();
    const cached = this.jwksCache.get(jwksUri);
    if (!forceRefresh && cached && cached.expiresAtMs > nowMs) {
      return cached.keys;
    }

    let response: Response;
    try {
      response = await fetch(jwksUri, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    if (!response.ok) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    const keys = extractRsaJwks(rawJson);
    if (keys.length === 0) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_PROVIDER_ERROR);
    }

    const ttlSec = parseMaxAgeSeconds(response.headers.get('cache-control'));
    this.jwksCache.set(jwksUri, {
      keys,
      expiresAtMs: nowMs + ttlSec * 1_000,
    });
    return keys;
  }

  private validatePayloadClaims(
    payload: Record<string, unknown>,
    params: VerifyOidcIdTokenParams,
  ): OidcIdTokenPayload {
    const sub = typeof payload['sub'] === 'string' ? payload['sub'].trim() : '';
    const iss = typeof payload['iss'] === 'string' ? payload['iss'].trim() : '';
    const exp = payload['exp'];
    const nbf = payload['nbf'];
    const audRaw = payload['aud'];
    const azp = typeof payload['azp'] === 'string' ? payload['azp'].trim() : undefined;

    if (!sub || !iss || !params.expectedIssuers.includes(iss)) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    let normalizedAud: string | string[];
    if (typeof audRaw === 'string') {
      if (audRaw !== params.expectedAudience) {
        throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
      }
      normalizedAud = audRaw;
    } else if (Array.isArray(audRaw) && audRaw.every((item) => typeof item === 'string')) {
      if (!audRaw.includes(params.expectedAudience)) {
        throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
      }
      if (audRaw.length > 1 && azp !== params.expectedAudience) {
        throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
      }
      normalizedAud = audRaw;
    } else {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    const tolerance = params.clockToleranceSec ?? DEFAULT_CLOCK_TOLERANCE_SEC;
    const nowSec = Math.floor(Date.now() / 1_000);

    if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= nowSec - tolerance) {
      throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
    }

    if (nbf !== undefined) {
      if (typeof nbf !== 'number' || !Number.isFinite(nbf) || nbf > nowSec + tolerance) {
        throw new AppHttpException(ErrorCode.AUTH_OAUTH_INVALID_CODE);
      }
    }

    const email = payload['email'];
    const emailVerified = payload['email_verified'];
    const name = payload['name'];
    const givenName = payload['given_name'];
    const familyName = payload['family_name'];

    return {
      sub,
      iss,
      aud: normalizedAud,
      exp,
      ...(typeof email === 'string' ? { email } : {}),
      ...(typeof emailVerified === 'boolean' ? { email_verified: emailVerified } : {}),
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof givenName === 'string' ? { given_name: givenName } : {}),
      ...(typeof familyName === 'string' ? { family_name: familyName } : {}),
    };
  }
}

function parseJwtSegment(segment: string): Record<string, unknown> | null {
  try {
    const decoded = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractRsaJwks(raw: unknown): RsaJwk[] {
  if (typeof raw !== 'object' || raw === null || !('keys' in raw)) {
    return [];
  }
  const keysField = (raw as { keys?: unknown }).keys;
  if (!Array.isArray(keysField)) {
    return [];
  }

  const validKeys: RsaJwk[] = [];
  for (const item of keysField) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    if (
      candidate['kty'] === 'RSA' &&
      typeof candidate['kid'] === 'string' &&
      candidate['kid'].length > 0 &&
      typeof candidate['n'] === 'string' &&
      candidate['n'].length > 0 &&
      typeof candidate['e'] === 'string' &&
      candidate['e'].length > 0
    ) {
      validKeys.push(candidate as unknown as RsaJwk);
    }
  }
  return validKeys;
}

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) {
    return DEFAULT_CACHE_TTL_SEC;
  }
  const match = /max-age=(\d+)/i.exec(cacheControl);
  if (!match?.[1]) {
    return DEFAULT_CACHE_TTL_SEC;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_TTL_SEC;
  }
  return Math.max(MIN_CACHE_TTL_SEC, Math.min(MAX_CACHE_TTL_SEC, parsed));
}
