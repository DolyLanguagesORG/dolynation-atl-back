import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { AppConfigService } from '../../../config/env.config';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_SCOPES,
  GoogleOAuthProvider,
} from './google-oauth.provider';
import type { OidcJwksVerifier } from './oidc-jwks.verifier';

describe('GoogleOAuthProvider', () => {
  let jwksVerifier: jest.Mocked<Pick<OidcJwksVerifier, 'verifyIdToken'>>;

  const makeConfig = (enabled: boolean): AppConfigService =>
    ({
      oauth: {
        google: enabled
          ? {
              enabled: true,
              clientId: 'test-client-id',
              clientSecret: 'test-client-secret',
              redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
            }
          : {
              enabled: false,
              clientId: undefined,
              clientSecret: undefined,
              redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
            },
      },
    }) as unknown as AppConfigService;

  beforeEach(() => {
    jwksVerifier = {
      verifyIdToken: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports enabled=false without secrets when Google OAuth is unconfigured', () => {
    const provider = new GoogleOAuthProvider(makeConfig(false), jwksVerifier as never);
    expect(provider.getPublicConfig()).toEqual({
      provider: 'google',
      enabled: false,
    });
  });

  it('reports public authorization config when enabled (never exposing clientSecret)', () => {
    const provider = new GoogleOAuthProvider(makeConfig(true), jwksVerifier as never);
    const publicCfg = provider.getPublicConfig();

    expect(publicCfg).toEqual({
      provider: 'google',
      enabled: true,
      authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
      clientId: 'test-client-id',
      redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
      scopes: [...GOOGLE_SCOPES],
    });
    expect(publicCfg).not.toHaveProperty('clientSecret');
  });

  it('throws AUTH_OAUTH_NOT_CONFIGURED when exchanging code while disabled', async () => {
    const provider = new GoogleOAuthProvider(makeConfig(false), jwksVerifier as never);

    const err = await provider
      .exchangeCodeForProfile({
        code: 'code-1',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
      })
      .then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

    expect(err).toBeInstanceOf(AppHttpException);
    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_NOT_CONFIGURED });
  });

  it('rejects mismatched redirectUri before calling Google token endpoint', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const provider = new GoogleOAuthProvider(makeConfig(true), jwksVerifier as never);

    const err = await provider
      .exchangeCodeForProfile({
        code: 'code-1',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'https://evil.example.com/callback',
      })
      .then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_INVALID_CODE });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps Google invalid_grant 400 response to AUTH_OAUTH_INVALID_CODE', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const provider = new GoogleOAuthProvider(makeConfig(true), jwksVerifier as never);
    const err = await provider
      .exchangeCodeForProfile({
        code: 'expired-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
      })
      .then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_INVALID_CODE });
  });

  it('maps Google 5xx upstream failure to AUTH_OAUTH_PROVIDER_ERROR', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'server_error' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const provider = new GoogleOAuthProvider(makeConfig(true), jwksVerifier as never);
    const err = await provider
      .exchangeCodeForProfile({
        code: 'code-1',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
      })
      .then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_PROVIDER_ERROR });
  });

  it('rejects profiles whose Google email is not verified', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'verified-by-mock' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    jwksVerifier.verifyIdToken.mockResolvedValue({
      sub: 'sub-1',
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      exp: 9999999999,
      email: 'student@school.edu',
      email_verified: false,
    });

    const provider = new GoogleOAuthProvider(makeConfig(true), jwksVerifier as never);
    const err = await provider
      .exchangeCodeForProfile({
        code: 'code-1',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
      })
      .then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED });
  });

  it('returns normalized verified profile on successful exchange', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'mock-id-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    jwksVerifier.verifyIdToken.mockResolvedValue({
      sub: 'google-sub-99',
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      exp: 9999999999,
      email: '  Student@School.EDU ',
      email_verified: true,
      given_name: 'Ana',
      family_name: 'López',
    });

    const provider = new GoogleOAuthProvider(makeConfig(true), jwksVerifier as never);
    const profile = await provider.exchangeCodeForProfile({
      code: 'auth-code-123',
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
    });

    expect(profile).toEqual({
      provider: 'google',
      providerUserId: 'google-sub-99',
      email: 'student@school.edu',
      emailVerified: true,
      fullName: 'Ana López',
    });
  });
});
