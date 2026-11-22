import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { DrizzleDb } from '../../../database/database.module';
import type { UsersService, UserWithRole } from '../../users/users.service';
import type { AuthService } from '../auth.service';
import { AuthOAuthService } from './auth-oauth.service';
import type { GoogleOAuthProvider } from './google-oauth.provider';

describe('AuthOAuthService', () => {
  let dbMock: { select: jest.Mock; insert: jest.Mock; update: jest.Mock };
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findById'
      | 'findByEmailInsensitive'
      | 'createOAuthUser'
      | 'markEmailVerified'
      | 'clearPassword'
    >
  >;
  let authService: jest.Mocked<Pick<AuthService, 'issueOAuthSession' | 'logoutAll'>>;
  let googleProvider: jest.Mocked<
    Pick<GoogleOAuthProvider, 'provider' | 'getPublicConfig' | 'exchangeCodeForProfile'>
  >;
  let auditLogs: { logEvent: jest.Mock };
  let errorLogs: { logError: jest.Mock };
  let service: AuthOAuthService;

  const studentUser: UserWithRole = {
    id: 10,
    email: 'student@school.edu',
    fullName: 'Ana López',
    password: null,
    roleId: 1,
    role: 'student',
    subscriptionTier: null,
    stripeCustomerId: null,
    currentStreak: 0,
    lastStreakDate: null,
    emailVerifiedAt: new Date('2026-11-20T00:00:00Z'),
    locale: 'es',
    createdAt: new Date('2026-11-20T00:00:00Z'),
    updatedAt: null,
    deletedAt: null,
  };

  const adminUser: UserWithRole = {
    ...studentUser,
    id: 1,
    email: 'admin@dolynation.org',
    roleId: 2,
    role: 'admin',
    password: 'argon2-hash',
  };

  const mockSelectOAuthLink = (rows: unknown[]) => {
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(rows),
        }),
      }),
    });
  };

  const exchangeInput = {
    code: 'auth-code',
    codeVerifier: 'v'.repeat(43),
    redirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
    locale: 'es' as const,
  };

  beforeEach(() => {
    dbMock = {
      select: jest.fn(),
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
    };
    usersService = {
      findById: jest.fn(),
      findByEmailInsensitive: jest.fn(),
      createOAuthUser: jest.fn(),
      markEmailVerified: jest.fn().mockResolvedValue(undefined),
      clearPassword: jest.fn().mockResolvedValue(undefined),
    };
    authService = {
      issueOAuthSession: jest.fn(),
      logoutAll: jest.fn().mockResolvedValue(undefined),
    };
    googleProvider = {
      provider: 'google',
      getPublicConfig: jest.fn().mockReturnValue({ provider: 'google', enabled: true }),
      exchangeCodeForProfile: jest.fn().mockResolvedValue({
        provider: 'google',
        providerUserId: 'google-sub-1',
        email: 'student@school.edu',
        emailVerified: true,
        fullName: 'Ana López',
      }),
    };
    auditLogs = { logEvent: jest.fn().mockResolvedValue(undefined) };
    errorLogs = { logError: jest.fn().mockResolvedValue(undefined) };

    service = new AuthOAuthService(
      dbMock as unknown as DrizzleDb,
      usersService as never,
      authService as never,
      googleProvider as never,
      auditLogs as never,
      errorLogs as never,
    );
  });

  it('rejects unsupported OAuth providers with AUTH_OAUTH_UNSUPPORTED_PROVIDER', async () => {
    const err = await service.exchangeCode('facebook', exchangeInput).then(
      () => null,
      (caught: unknown) => caught as AppHttpException,
    );

    expect(err).toBeInstanceOf(AppHttpException);
    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_UNSUPPORTED_PROVIDER });
  });

  it('creates a new student account and links OAuth identity on first Google sign-in', async () => {
    mockSelectOAuthLink([]);
    usersService.findByEmailInsensitive.mockResolvedValue(null);
    usersService.createOAuthUser.mockResolvedValue(studentUser);
    authService.issueOAuthSession.mockResolvedValue({
      user: {
        id: studentUser.id,
        email: studentUser.email,
        fullName: studentUser.fullName,
        role: 'student',
        subscriptionTier: null,
        currentStreak: 0,
        lastStreakDate: null,
        emailVerifiedAt: studentUser.emailVerifiedAt,
        locale: 'es',
        createdAt: studentUser.createdAt,
      },
      tokens: { accessToken: 'a.jwt', refreshToken: 'r.jwt', expiresIn: 300 },
    });

    const result = await service.exchangeCode('google', exchangeInput);

    expect(usersService.createOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student@school.edu',
        fullName: 'Ana López',
        locale: 'es',
      }),
    );
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(authService.issueOAuthSession).toHaveBeenCalledWith(studentUser, {
      provider: 'google',
      event: 'auth.oauth_registered',
      isNewUser: true,
      linkedExistingAccount: false,
    });
    expect(result.isNewUser).toBe(true);
    expect(result.linkedExistingAccount).toBe(false);
  });

  it('logs in returning user when OAuth link already exists', async () => {
    mockSelectOAuthLink([
      {
        id: 5,
        userId: studentUser.id,
        provider: 'google',
        providerUserId: 'google-sub-1',
        providerEmail: 'student@school.edu',
      },
    ]);
    usersService.findById.mockResolvedValue(studentUser);
    authService.issueOAuthSession.mockResolvedValue({
      user: {
        id: studentUser.id,
        email: studentUser.email,
        fullName: studentUser.fullName,
        role: 'student',
        subscriptionTier: null,
        currentStreak: 0,
        lastStreakDate: null,
        emailVerifiedAt: studentUser.emailVerifiedAt,
        locale: 'es',
        createdAt: studentUser.createdAt,
      },
      tokens: { accessToken: 'a.jwt', refreshToken: 'r.jwt', expiresIn: 300 },
    });

    const result = await service.exchangeCode('google', exchangeInput);

    expect(usersService.createOAuthUser).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    expect(result.linkedExistingAccount).toBe(false);
  });

  it('auto-links existing unverified student account by matching email and marks email verified', async () => {
    const unverifiedStudent: UserWithRole = { ...studentUser, emailVerifiedAt: null };
    const verifiedStudent: UserWithRole = {
      ...studentUser,
      emailVerifiedAt: new Date('2026-11-21T00:00:00Z'),
    };
    mockSelectOAuthLink([]);
    usersService.findByEmailInsensitive.mockResolvedValue(unverifiedStudent);
    usersService.findById.mockResolvedValue(verifiedStudent);
    authService.issueOAuthSession.mockResolvedValue({
      user: {
        id: verifiedStudent.id,
        email: verifiedStudent.email,
        fullName: verifiedStudent.fullName,
        role: 'student',
        subscriptionTier: null,
        currentStreak: 0,
        lastStreakDate: null,
        emailVerifiedAt: verifiedStudent.emailVerifiedAt,
        locale: 'es',
        createdAt: verifiedStudent.createdAt,
      },
      tokens: { accessToken: 'a.jwt', refreshToken: 'r.jwt', expiresIn: 300 },
    });

    const result = await service.exchangeCode('google', exchangeInput);

    expect(usersService.markEmailVerified).toHaveBeenCalledWith(unverifiedStudent.id);
    // La contraseña y las sesiones de una cuenta sin verificar no se heredan.
    expect(usersService.clearPassword).toHaveBeenCalledWith(unverifiedStudent.id);
    expect(authService.logoutAll).toHaveBeenCalledWith(unverifiedStudent.id);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(result.isNewUser).toBe(false);
    expect(result.linkedExistingAccount).toBe(true);
  });

  it('blocks OAuth auto-linking and sign-in for administrator accounts matched by email', async () => {
    googleProvider.exchangeCodeForProfile.mockResolvedValue({
      provider: 'google',
      providerUserId: 'google-sub-admin',
      email: adminUser.email,
      emailVerified: true,
      fullName: 'Admin',
    });
    mockSelectOAuthLink([]);
    usersService.findByEmailInsensitive.mockResolvedValue(adminUser);

    const err = await service.exchangeCode('google', exchangeInput).then(
      () => null,
      (caught: unknown) => caught as AppHttpException,
    );

    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_ADMIN_FORBIDDEN });
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(authService.issueOAuthSession).not.toHaveBeenCalled();
    expect(auditLogs.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.oauth_admin_blocked', actorUserId: adminUser.id }),
    );
  });

  it('blocks OAuth sign-in even if an administrator already has a linked OAuth row', async () => {
    mockSelectOAuthLink([
      {
        id: 9,
        userId: adminUser.id,
        provider: 'google',
        providerUserId: 'google-sub-1',
        providerEmail: adminUser.email,
      },
    ]);
    usersService.findById.mockResolvedValue(adminUser);

    const err = await service.exchangeCode('google', exchangeInput).then(
      () => null,
      (caught: unknown) => caught as AppHttpException,
    );

    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_OAUTH_ADMIN_FORBIDDEN });
    expect(authService.issueOAuthSession).not.toHaveBeenCalled();
  });
});
