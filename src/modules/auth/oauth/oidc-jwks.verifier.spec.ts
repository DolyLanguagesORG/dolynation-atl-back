import { generateKeyPairSync, sign as signPayload } from 'node:crypto';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { OidcJwksVerifier } from './oidc-jwks.verifier';

function toBase64Url(data: string | Buffer): string {
  return Buffer.from(data).toString('base64url');
}

describe('OidcJwksVerifier', () => {
  const jwksUri = 'https://www.googleapis.com/oauth2/v3/certs';
  const expectedIssuers = ['https://accounts.google.com', 'accounts.google.com'];
  const expectedAudience = 'test-google-client-id.apps.googleusercontent.com';

  let verifier: OidcJwksVerifier;

  const makeKeyWithToken = (kid: string, claims: Record<string, unknown>, alg = 'RS256') => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid,
      use: 'sig',
      alg: 'RS256',
    };

    const headerPart = toBase64Url(JSON.stringify({ alg, kid, typ: 'JWT' }));
    const payloadPart = toBase64Url(JSON.stringify(claims));
    const signingInput = `${headerPart}.${payloadPart}`;
    const signature = signPayload('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKey);
    const token = `${signingInput}.${toBase64Url(signature)}`;

    return { jwk, token };
  };

  beforeEach(() => {
    verifier = new OidcJwksVerifier();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies a valid RS256 OIDC ID token and caches JWKS responses', async () => {
    const nowSec = Math.floor(Date.now() / 1_000);
    const { jwk, token } = makeKeyWithToken('key-1', {
      sub: 'google-sub-123',
      iss: 'https://accounts.google.com',
      aud: expectedAudience,
      exp: nowSec + 3600,
      email: 'student@school.edu',
      email_verified: true,
      name: 'Maria Student',
    });

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
      }),
    );

    const claims = await verifier.verifyIdToken({
      idToken: token,
      jwksUri,
      expectedIssuers,
      expectedAudience,
    });

    expect(claims.sub).toBe('google-sub-123');
    expect(claims.email).toBe('student@school.edu');
    expect(claims.email_verified).toBe(true);

    // Segunda llamada usa el caché sin volver a llamar a fetch.
    await verifier.verifyIdToken({
      idToken: token,
      jwksUri,
      expectedIssuers,
      expectedAudience,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshes JWKS once on an unknown kid to support key rotation', async () => {
    const nowSec = Math.floor(Date.now() / 1_000);
    const first = makeKeyWithToken('old-kid', {
      sub: 's1',
      iss: 'https://accounts.google.com',
      aud: expectedAudience,
      exp: nowSec + 3600,
    });
    const rotated = makeKeyWithToken('new-kid', {
      sub: 's2',
      iss: 'https://accounts.google.com',
      aud: expectedAudience,
      exp: nowSec + 3600,
      email: 'rotated@school.edu',
      email_verified: true,
    });

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [first.jwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [rotated.jwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
        }),
      );

    await verifier.verifyIdToken({
      idToken: first.token,
      jwksUri,
      expectedIssuers,
      expectedAudience,
    });

    const claims = await verifier.verifyIdToken({
      idToken: rotated.token,
      jwksUri,
      expectedIssuers,
      expectedAudience,
    });

    expect(claims.sub).toBe('s2');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects expired tokens, wrong audience, wrong issuer, or tampered signature', async () => {
    const nowSec = Math.floor(Date.now() / 1_000);

    const expired = makeKeyWithToken('k-exp', {
      sub: 's1',
      iss: 'https://accounts.google.com',
      aud: expectedAudience,
      exp: nowSec - 600,
    });
    const wrongAud = makeKeyWithToken('k-aud', {
      sub: 's1',
      iss: 'https://accounts.google.com',
      aud: 'other-client-id',
      exp: nowSec + 3600,
    });
    const wrongIss = makeKeyWithToken('k-iss', {
      sub: 's1',
      iss: 'https://evil.example.com',
      aud: expectedAudience,
      exp: nowSec + 3600,
    });
    const valid = makeKeyWithToken('k-valid', {
      sub: 's1',
      iss: 'https://accounts.google.com',
      aud: expectedAudience,
      exp: nowSec + 3600,
    });
    const tamperedParts = valid.token.split('.');
    const tamperedToken = `${tamperedParts[0]}.${toBase64Url(JSON.stringify({ sub: 'hacker', iss: 'https://accounts.google.com', aud: expectedAudience, exp: nowSec + 3600 }))}.${tamperedParts[2]}`;

    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ keys: [expired.jwk, wrongAud.jwk, wrongIss.jwk, valid.jwk] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    for (const badToken of [
      expired.token,
      wrongAud.token,
      wrongIss.token,
      tamperedToken,
      'not-jwt',
    ]) {
      const error = await verifier
        .verifyIdToken({
          idToken: badToken,
          jwksUri,
          expectedIssuers,
          expectedAudience,
        })
        .then(
          () => null,
          (err: unknown) => err as AppHttpException,
        );

      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_INVALID_CODE });
    }
  });
});
