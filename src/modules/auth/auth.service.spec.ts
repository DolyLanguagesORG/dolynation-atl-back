import { Test } from '@nestjs/testing';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AppConfigService } from '../../config/env.config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService, type PublicUser } from '../users/users.service';
import { AuthEventLogService } from '../readings/prompt-logs';
import { createHash } from 'node:crypto';
import { DRIZZLE } from '../../database/database.tokens';
import { authAccessTokens } from '../../database/drizzle/schema';
import { MailService } from '../mail/mail.service';
import { AuthEmailTokenService } from './auth-email-token.service';
import { ErrorCode } from '../../common/errors/error-codes';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'findById'
      | 'create'
      | 'verifyPassword'
      | 'toPublic'
      | 'updatePassword'
      | 'markEmailVerified'
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let authEventLogService: jest.Mocked<Pick<AuthEventLogService, 'logAuthEvent'>>;
  let mailService: jest.Mocked<Pick<MailService, 'sendAccountConfirmation' | 'sendPasswordReset'>>;
  let emailTokenService: jest.Mocked<
    Pick<AuthEmailTokenService, 'issue' | 'consume' | 'revokeActive'>
  >;
  const db = { insert: jest.fn(), select: jest.fn(), update: jest.fn() };

  /** Permite alternar el flag `EMAIL_VERIFICATION_REQUIRED` entre pruebas. */
  let verificationRequired: boolean;

  const publicUserFixture: PublicUser = {
    id: 1,
    email: 'a@b.c',
    fullName: 'A B',
    subscriptionTier: null,
    currentStreak: 0,
    lastStreakDate: null,
    emailVerifiedAt: null,
    locale: 'es',
    createdAt: new Date(),
  };

  const userRowFixture = {
    id: 1,
    email: 'a@b.c',
    password: 'hash',
    fullName: 'A B',
    currentStreak: 0,
    lastStreakDate: null,
    subscriptionTier: null,
    emailVerifiedAt: null as Date | null,
    locale: 'es',
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    verificationRequired = false;
    db.insert.mockReset();
    db.select.mockReset();
    db.update.mockReset();
    db.insert.mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      verifyPassword: jest.fn(),
      toPublic: jest.fn(),
      updatePassword: jest.fn(),
      markEmailVerified: jest.fn().mockResolvedValue(undefined),
    };

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as never;

    authEventLogService = {
      logAuthEvent: jest.fn().mockResolvedValue(undefined),
    };

    mailService = {
      sendAccountConfirmation: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };

    emailTokenService = {
      issue: jest.fn().mockResolvedValue('token-en-claro'),
      consume: jest.fn(),
      revokeActive: jest.fn().mockResolvedValue(undefined),
    };

    const configMock = {
      jwt: { accessTtl: '5m', refreshTtl: '30d' },
      get mail() {
        return {
          verificationRequired,
        };
      },
    } as unknown as AppConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: AppConfigService, useValue: configMock },
        { provide: AuthEventLogService, useValue: authEventLogService },
        { provide: DRIZZLE, useValue: db },
        { provide: MailService, useValue: mailService },
        { provide: AuthEmailTokenService, useValue: emailTokenService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('creates a user, logs the event, and returns tokens', async () => {
      const userRow = {
        id: 1,
        email: 'a@b.c',
        password: 'hash',
        fullName: 'A B',
        currentStreak: 0,
        lastStreakDate: null,
        subscriptionTier: null,
        emailVerifiedAt: null,
        locale: 'es',
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(userRow);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      const result = await service.register({
        email: 'a@b.c',
        password: 'secret123',
        fullName: 'A B',
      });

      expect(usersService.create).toHaveBeenCalledWith({
        email: 'a@b.c',
        password: 'secret123',
        fullName: 'A B',
        locale: 'es',
      });
      expect(authEventLogService.logAuthEvent).toHaveBeenCalledWith('user_registered', 1);
      expect(result.tokens?.accessToken).toBe('access.jwt');
      expect(result.tokens?.refreshToken).toBe('refresh.jwt');
      expect(result.emailVerificationRequired).toBe(false);
      expect(result.user.email).toBe('a@b.c');
    });

    it('sends the account confirmation email with a verification token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(userRowFixture);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      await service.register({ email: 'a@b.c', password: 'secret123', fullName: 'A B' });

      expect(emailTokenService.issue).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, type: 'email_verification' }),
      );
      expect(mailService.sendAccountConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.c', token: 'token-en-claro', locale: 'es' }),
      );
    });

    it('keeps the locale sent by the client so the email is written in that language', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...userRowFixture, locale: 'en' });
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      await service.register({
        email: 'a@b.c',
        password: 'secret123',
        fullName: 'A B',
        locale: 'en',
      });

      expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
      expect(mailService.sendAccountConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'en' }),
      );
    });

    it('does not fail the registration when the email cannot be delivered', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(userRowFixture);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');
      mailService.sendAccountConfirmation.mockRejectedValue(new Error('SMTP down'));

      const result = await service.register({
        email: 'a@b.c',
        password: 'secret123',
        fullName: 'A B',
      });

      expect(result.tokens?.accessToken).toBe('access.jwt');
      expect(result.user.email).toBe('a@b.c');
    });

    it('does not issue tokens when the email verification is required', async () => {
      verificationRequired = true;
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(userRowFixture);
      usersService.toPublic.mockReturnValue(publicUserFixture);

      const result = await service.register({
        email: 'a@b.c',
        password: 'secret123',
        fullName: 'A B',
      });

      expect(result.tokens).toBeNull();
      expect(result.emailVerificationRequired).toBe(true);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('throws ConflictException if email already exists', async () => {
      const existing = { id: 1, email: 'a@b.c' };
      usersService.findByEmail.mockResolvedValue(existing as never);
      await expect(
        service.register({ email: 'a@b.c', password: 'secret123', fullName: 'A B' }),
      ).rejects.toBeInstanceOf(AppHttpException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const userRow = {
        id: 1,
        email: 'a@b.c',
        password: 'hash',
        fullName: 'A B',
        currentStreak: 0,
        lastStreakDate: null,
        emailVerifiedAt: null,
        locale: 'es',
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
        subscriptionTier: null,
      };
      usersService.findByEmail.mockResolvedValue(userRow);
      usersService.verifyPassword.mockResolvedValue(true);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      const result = await service.login({ email: 'a@b.c', password: 'secret123' });

      expect(result.tokens.accessToken).toBe('access.jwt');
      expect(result.tokens.expiresIn).toBe(300);
      expect(authEventLogService.logAuthEvent).toHaveBeenCalledWith('user_login', 1);
    });

    it('persists only a SHA-256 hash of the refresh token', async () => {
      const values = jest.fn().mockResolvedValue(undefined);
      db.insert.mockReturnValue({ values });
      const userRow = {
        id: 1,
        email: 'a@b.c',
        password: 'hash',
        fullName: 'A B',
        currentStreak: 0,
        lastStreakDate: null,
        emailVerifiedAt: null,
        locale: 'es',
        subscriptionTier: null,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      };

      usersService.findByEmail.mockResolvedValue(userRow);
      usersService.verifyPassword.mockResolvedValue(true);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      await service.login({ email: 'a@b.c', password: 'secret123' });

      expect(db.insert).toHaveBeenCalledWith(authAccessTokens);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenableId: 1,
          type: 'refresh',
          hash: createHash('sha256').update('refresh.jwt').digest('hex'),
          abilities: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('throws UnauthorizedException for unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.login({ email: 'a@b.c', password: 'x' })).rejects.toBeInstanceOf(
        AppHttpException,
      );
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const userRow = {
        id: 1,
        email: 'a@b.c',
        password: 'hash',
        fullName: 'A B',
        currentStreak: 0,
        lastStreakDate: null,
        emailVerifiedAt: null,
        locale: 'es',
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
        subscriptionTier: null,
      };
      usersService.findByEmail.mockResolvedValue(userRow);
      usersService.verifyPassword.mockResolvedValue(false);
      await expect(service.login({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(
        AppHttpException,
      );
    });

    it('blocks the login of an unverified account when the verification is required', async () => {
      verificationRequired = true;
      usersService.findByEmail.mockResolvedValue({ ...userRowFixture, emailVerifiedAt: null });
      usersService.verifyPassword.mockResolvedValue(true);

      const error = await service.login({ email: 'a@b.c', password: 'secret123' }).then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_EMAIL_NOT_VERIFIED });
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('allows the login of a verified account when the verification is required', async () => {
      verificationRequired = true;
      usersService.findByEmail.mockResolvedValue({
        ...userRowFixture,
        emailVerifiedAt: new Date(),
      });
      usersService.verifyPassword.mockResolvedValue(true);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      const result = await service.login({ email: 'a@b.c', password: 'secret123' });

      expect(result.tokens.accessToken).toBe('access.jwt');
    });

    it('allows the login of an unverified account when the verification is not required', async () => {
      verificationRequired = false;
      usersService.findByEmail.mockResolvedValue({ ...userRowFixture, emailVerifiedAt: null });
      usersService.verifyPassword.mockResolvedValue(true);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      const result = await service.login({ email: 'a@b.c', password: 'secret123' });

      expect(result.tokens.accessToken).toBe('access.jwt');
    });
  });

  describe('refresh', () => {
    it('rejects a valid JWT that is not stored in the database', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      db.select.mockReturnValue({ from });

      jwtService.verifyAsync.mockResolvedValue({
        sub: 1,
        email: 'a@b.c',
        type: 'refresh',
      });
      jwtService.signAsync
        .mockResolvedValueOnce('new.access.jwt')
        .mockResolvedValueOnce('new.refresh.jwt');

      await expect(service.refresh('valid.refresh.jwt')).rejects.toBeInstanceOf(AppHttpException);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('revokes the stored refresh token and persists the replacement', async () => {
      const oldToken = 'valid.refresh.jwt';
      const activeToken = {
        id: 7,
        tokenableId: 1,
        type: 'refresh',
        hash: createHash('sha256').update(oldToken).digest('hex'),
        abilities: '["refresh"]',
        createdAt: new Date(),
        updatedAt: null,
        lastUsedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        deletedAt: null,
        name: null,
      };

      const limit = jest.fn().mockResolvedValue([activeToken]);
      const whereSelect = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where: whereSelect });
      db.select.mockReturnValue({ from });

      const returning = jest.fn().mockResolvedValue([{ id: 7 }]);
      const whereUpdate = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where: whereUpdate });
      db.update.mockReturnValue({ set });

      const values = jest.fn().mockResolvedValue(undefined);
      db.insert.mockReturnValue({ values });

      jwtService.verifyAsync.mockResolvedValue({
        sub: 1,
        email: 'a@b.c',
        type: 'refresh',
      });
      jwtService.signAsync
        .mockResolvedValueOnce('new.access.jwt')
        .mockResolvedValueOnce('new.refresh.jwt');

      const result = await service.refresh(oldToken);

      expect(result.accessToken).toBe('new.access.jwt');
      expect(result.refreshToken).toBe('new.refresh.jwt');
      expect(result.refreshToken).not.toBe(oldToken);
      expect(db.update).toHaveBeenCalledWith(authAccessTokens);
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
      expect(whereUpdate).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledWith(authAccessTokens);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenableId: 1,
          type: 'refresh',
          hash: createHash('sha256').update('new.refresh.jwt').digest('hex'),
        }),
      );
    });
  });

  describe('logout', () => {
    it('invalidates only the supplied refresh token for the current user', async () => {
      const where = jest.fn().mockResolvedValue(undefined);
      const set = jest.fn().mockReturnValue({ where });
      db.update.mockReturnValue({ set });
      const refreshToken = 'current.session.refresh.jwt';

      await service.logout(1, refreshToken);

      expect(db.update).toHaveBeenCalledWith(authAccessTokens);
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
      expect(where).toHaveBeenCalled();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('invalidates all refresh tokens for the current user', async () => {
      const where = jest.fn().mockResolvedValue(undefined);
      const set = jest.fn().mockReturnValue({ where });
      db.update.mockReturnValue({ set });

      await service.logoutAll(1);

      expect(db.update).toHaveBeenCalledWith(authAccessTokens);
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
      expect(where).toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('returns the public user view', async () => {
      const userRow = {
        id: 1,
        email: 'a@b.c',
        password: 'x',
        fullName: 'A B',
        currentStreak: 0,
        lastStreakDate: null,
        emailVerifiedAt: null,
        locale: 'es',
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
        subscriptionTier: null,
      };
      usersService.findById.mockResolvedValue(userRow);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      const me = await service.me(1);
      expect(me.email).toBe('a@b.c');
    });

    it('throws UnauthorizedException if user no longer exists', async () => {
      usersService.findById.mockResolvedValue(null);
      await expect(service.me(1)).rejects.toBeInstanceOf(AppHttpException);
    });
  });

  describe('verifyEmail', () => {
    it('consumes the token, marks the account as verified and issues session tokens', async () => {
      const verifiedAt = new Date();
      emailTokenService.consume.mockResolvedValue({ userId: 7 });
      usersService.findById.mockResolvedValue({
        ...userRowFixture,
        id: 7,
        emailVerifiedAt: verifiedAt,
      });
      usersService.toPublic.mockReturnValue({
        ...publicUserFixture,
        id: 7,
        emailVerifiedAt: verifiedAt,
      });
      jwtService.signAsync
        .mockResolvedValueOnce('verify.access')
        .mockResolvedValueOnce('verify.refresh');

      const result = await service.verifyEmail('token-en-claro');

      expect(emailTokenService.consume).toHaveBeenCalledWith(
        'token-en-claro',
        'email_verification',
      );
      expect(usersService.markEmailVerified).toHaveBeenCalledWith(7);
      expect(usersService.findById).toHaveBeenCalledWith(7);
      expect(result.emailVerified).toBe(true);
      expect(result.user.id).toBe(7);
      expect(result.tokens.accessToken).toBe('verify.access');
      expect(result.tokens.refreshToken).toBe('verify.refresh');
      expect(authEventLogService.logAuthEvent).toHaveBeenCalledWith('user_login', 7);
    });

    it('rejects an invalid, expired or already used token', async () => {
      emailTokenService.consume.mockResolvedValue(null);

      const error = await service.verifyEmail('token-invalido').then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_EMAIL_TOKEN_INVALID });
      expect(usersService.markEmailVerified).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('sends the reset email to an existing account', async () => {
      usersService.findByEmail.mockResolvedValue(userRowFixture);

      const result = await service.forgotPassword('a@b.c');

      expect(emailTokenService.issue).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, type: 'password_reset' }),
      );
      expect(mailService.sendPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.c', token: 'token-en-claro' }),
      );
      expect(result.emailSent).toBe(true);
    });

    it('answers exactly the same for an unknown account and sends nothing', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('nadie@example.com');

      expect(result).toEqual({ emailSent: true });
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
      expect(emailTokenService.issue).not.toHaveBeenCalled();
    });

    it('still answers successfully when the email cannot be delivered', async () => {
      usersService.findByEmail.mockResolvedValue(userRowFixture);
      mailService.sendPasswordReset.mockRejectedValue(new Error('SMTP down'));

      const result = await service.forgotPassword('a@b.c');

      expect(result).toEqual({ emailSent: true });
    });

    it('stops sending emails once the request limit is reached', async () => {
      usersService.findByEmail.mockResolvedValue(userRowFixture);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await service.forgotPassword('a@b.c');
      }
      expect(mailService.sendPasswordReset).toHaveBeenCalledTimes(3);

      const result = await service.forgotPassword('a@b.c');

      expect(result).toEqual({ emailSent: true });
      expect(mailService.sendPasswordReset).toHaveBeenCalledTimes(3);
    });
  });

  describe('resendVerification', () => {
    it('sends a new confirmation email while the account is unverified', async () => {
      usersService.findByEmail.mockResolvedValue({ ...userRowFixture, emailVerifiedAt: null });

      const result = await service.resendVerification('a@b.c');

      expect(mailService.sendAccountConfirmation).toHaveBeenCalledTimes(1);
      expect(result.emailSent).toBe(true);
    });

    it('sends nothing when the account is already verified', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...userRowFixture,
        emailVerifiedAt: new Date(),
      });

      const result = await service.resendVerification('a@b.c');

      expect(mailService.sendAccountConfirmation).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(true);
    });

    it('answers exactly the same for an unknown account', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.resendVerification('nadie@example.com');

      expect(result).toEqual({ emailSent: true });
      expect(mailService.sendAccountConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates the password and revokes every active session', async () => {
      emailTokenService.consume.mockResolvedValue({ userId: 7 });
      const where = jest.fn().mockResolvedValue(undefined);
      const set = jest.fn().mockReturnValue({ where });
      db.update.mockReturnValue({ set });

      const result = await service.resetPassword('token-en-claro', 'newSecret123');

      expect(emailTokenService.consume).toHaveBeenCalledWith('token-en-claro', 'password_reset');
      expect(usersService.updatePassword).toHaveBeenCalledWith(7, 'newSecret123');
      expect(db.update).toHaveBeenCalledWith(authAccessTokens);
      expect(emailTokenService.revokeActive).toHaveBeenCalledWith(7, 'password_reset');
      expect(result.passwordUpdated).toBe(true);
    });

    it('rejects an invalid, expired or already used token', async () => {
      emailTokenService.consume.mockResolvedValue(null);

      const error = await service.resetPassword('token-invalido', 'newSecret123').then(
        () => null,
        (caught: unknown) => caught as AppHttpException,
      );

      expect(error).toBeInstanceOf(AppHttpException);
      expect(error?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_EMAIL_TOKEN_INVALID });
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });
  });
});
