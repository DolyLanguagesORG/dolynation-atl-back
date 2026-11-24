import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { AppConfigService } from '../../../config/env.config';
import {
  MICROSOFT_CONSUMER_TENANT_ID,
  MICROSOFT_SCOPES,
  MicrosoftOAuthProvider,
  getMicrosoftAuthorizationEndpoint,
  getMicrosoftJwksUri,
  getMicrosoftTokenEndpoint,
} from './microsoft-oauth.provider';
import type { OidcJwksVerifier } from './oidc-jwks.verifier';

describe('MicrosoftOAuthProvider', () => {
  let jwksVerifier: jest.Mocked<Pick<OidcJwksVerifier, 'verifyIdToken'>>;

  const makeConfig = (enabled: boolean, tenant = 'common'): AppConfigService =>
    ({
      oauth: {
        microsoft: enabled
          ? {
              enabled: true,
              clientId: 'ms-client-id',
              clientSecret: 'ms-client-secret',
              tenant,
              redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
            }
          : {
              enabled: false,
              clientId: undefined,
              clientSecret: undefined,
              tenant,
              redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
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

  it('reports enabled=false without secrets when Microsoft OAuth is unconfigured', () => {
    const provider = new MicrosoftOAuthProvider(makeConfig(false), jwksVerifier as never);
    expect(provider.getPublicConfig()).toEqual({
      provider: 'microsoft',
      enabled: false,
    });
  });

  it('reports public authorization config for the configured tenant without leaking clientSecret', () => {
    const provider = new MicrosoftOAuthProvider(
      makeConfig(true, 'organizations'),
      jwksVerifier as never,
    );
    const publicCfg = provider.getPublicConfig();

    expect(publicCfg).toEqual({
      provider: 'microsoft',
      enabled: true,
      authorizationEndpoint: getMicrosoftAuthorizationEndpoint('organizations'),
      clientId: 'ms-client-id',
      redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
      scopes: [...MICROSOFT_SCOPES],
    });
    expect(publicCfg).not.toHaveProperty('clientSecret');
  });

  it('throws AUTH_OAUTH_NOT_CONFIGURED when disabled', async () => {
    const provider = new MicrosoftOAuthProvider(makeConfig(false), jwksVerifier as never);
    const err = await provider
      .exchangeCodeForProfile({
        code: 'code-1',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
      })
      .then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

    expect(err).toBeInstanceOf(AppHttpException);
    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_NOT_CONFIGURED });
  });

  it('exchanges code, enforces dynamic tenant issuerValidator, and accepts preferred_username fallback for school accounts', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'mock.ms.jwt' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const orgTid = '11111111-2222-3333-4444-555555555555';
    jwksVerifier.verifyIdToken.mockResolvedValue({
      sub: 'ms-pairwise-sub-1',
      iss: `https://login.microsoftonline.com/${orgTid}/v2.0`,
      aud: 'ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tid: orgTid,
      preferred_username: 'Alumno@Universidad.EDU.MX',
      given_name: 'Carlos',
      family_name: 'Pérez',
    });

    const provider = new MicrosoftOAuthProvider(makeConfig(true, 'common'), jwksVerifier as never);
    const profile = await provider.exchangeCodeForProfile({
      code: 'ms-code-1',
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      getMicrosoftTokenEndpoint('common'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(jwksVerifier.verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        idToken: 'mock.ms.jwt',
        jwksUri: getMicrosoftJwksUri('common'),
        expectedAudience: 'ms-client-id',
      }),
    );

    const callArg = jwksVerifier.verifyIdToken.mock.calls[0]?.[0];
    const issuerValidator = callArg?.issuerValidator;
    expect(issuerValidator).toBeDefined();
    if (!issuerValidator) {
      throw new Error('Expected issuerValidator to be provided');
    }
    expect(
      issuerValidator(`https://login.microsoftonline.com/${orgTid}/v2.0`, {
        tid: orgTid,
      }),
    ).toBe(true);
    expect(
      issuerValidator(`https://login.microsoftonline.com/${MICROSOFT_CONSUMER_TENANT_ID}/v2.0`, {
        tid: MICROSOFT_CONSUMER_TENANT_ID,
      }),
    ).toBe(true);
    expect(issuerValidator('https://login.microsoftonline.com/other/v2.0', { tid: orgTid })).toBe(
      false,
    );
    expect(
      issuerValidator(`https://login.microsoftonline.com/${orgTid}/v2.0`, {
        tid: 'not-a-uuid',
      }),
    ).toBe(false);

    expect(profile).toEqual({
      provider: 'microsoft',
      providerUserId: 'ms-pairwise-sub-1',
      email: 'alumno@universidad.edu.mx',
      emailVerified: true,
      fullName: 'Carlos Pérez',
    });
  });

  it('enforces tenant policy when set to organizations or consumers or a pinned tenant UUID', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id_token: 'mock.ms.jwt' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    jwksVerifier.verifyIdToken.mockResolvedValue({
      sub: 's1',
      iss: 'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0',
      aud: 'ms-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'prof@school.edu',
    });

    const orgProvider = new MicrosoftOAuthProvider(
      makeConfig(true, 'organizations'),
      jwksVerifier as never,
    );
    await orgProvider.exchangeCodeForProfile({
      code: 'c',
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
    });
    const orgValidator = jwksVerifier.verifyIdToken.mock.calls[0]?.[0]?.issuerValidator;
    if (!orgValidator) {
      throw new Error('Expected orgValidator');
    }
    expect(
      orgValidator(`https://login.microsoftonline.com/${MICROSOFT_CONSUMER_TENANT_ID}/v2.0`, {
        tid: MICROSOFT_CONSUMER_TENANT_ID,
      }),
    ).toBe(false);
    expect(
      orgValidator('https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0', {
        tid: '11111111-2222-3333-4444-555555555555',
      }),
    ).toBe(true);

    const pinnedTid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const pinnedProvider = new MicrosoftOAuthProvider(
      makeConfig(true, pinnedTid),
      jwksVerifier as never,
    );
    await pinnedProvider.exchangeCodeForProfile({
      code: 'c',
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
    });
    const pinnedValidator = jwksVerifier.verifyIdToken.mock.calls[1]?.[0]?.issuerValidator;
    if (!pinnedValidator) {
      throw new Error('Expected pinnedValidator');
    }
    expect(
      pinnedValidator(`https://login.microsoftonline.com/${pinnedTid}/v2.0`, { tid: pinnedTid }),
    ).toBe(true);
    expect(
      pinnedValidator(
        'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0',
        { tid: '11111111-2222-3333-4444-555555555555' },
      ),
    ).toBe(false);
  });

  it('rejects unverified emails (email_verified=false, xms_edov=0, or #ext# guest UPN)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id_token: 'mock.ms.jwt' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const provider = new MicrosoftOAuthProvider(makeConfig(true, 'common'), jwksVerifier as never);

    for (const badClaims of [
      { email: 'user@outlook.com', email_verified: false },
      { email: 'user@gmail.com', xms_edov: 0 },
      { email: 'user@gmail.com', xms_edov: false },
      { preferred_username: 'guest_gmail.com#EXT#@school.onmicrosoft.com' },
    ]) {
      jwksVerifier.verifyIdToken.mockResolvedValueOnce({
        sub: 's1',
        iss: 'https://login.microsoftonline.com/common/v2.0',
        aud: 'ms-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...badClaims,
      });

      const err = await provider
        .exchangeCodeForProfile({
          code: 'c',
          codeVerifier: 'v'.repeat(43),
          redirectUri: 'http://localhost:3000/api/auth/oauth/microsoft/callback',
        })
        .then(
          () => null,
          (caught: unknown) => caught as AppHttpException,
        );
      expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED });
    }
  });
});
