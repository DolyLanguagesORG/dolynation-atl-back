import { Test } from '@nestjs/testing';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService, type PublicUser } from '../users/users.service';
import { AuthEventLogService } from '../readings/prompt-logs';
import { createHash } from 'node:crypto';
import { DRIZZLE } from '../../database/database.tokens';
import { authAccessTokens } from '../../database/drizzle/schema';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findById' | 'create' | 'verifyPassword' | 'toPublic'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let authEventLogService: jest.Mocked<Pick<AuthEventLogService, 'logAuthEvent'>>;
  const db = { insert: jest.fn(), select: jest.fn(), update: jest.fn() };

  const publicUserFixture: PublicUser = {
    id: 1,
    email: 'a@b.c',
    fullName: 'A B',
    subscriptionTier: null,
    currentStreak: 0,
    lastStreakDate: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
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
    };

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as never;

    authEventLogService = {
      logAuthEvent: jest.fn().mockResolvedValue(undefined),
    };

    const configMock = {
      get: jest.fn((key: string): string | undefined => {
        if (key === 'JWT_ACCESS_TTL') return '5m';
        if (key === 'JWT_REFRESH_TTL') return '30d';
        return undefined;
      }),
    } as unknown as ConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configMock },
        { provide: AuthEventLogService, useValue: authEventLogService },
        { provide: DRIZZLE, useValue: db },
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
      });
      expect(authEventLogService.logAuthEvent).toHaveBeenCalledWith('user_registered', 1);
      expect(result.tokens.accessToken).toBe('access.jwt');
      expect(result.tokens.refreshToken).toBe('refresh.jwt');
      expect(result.user.email).toBe('a@b.c');
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
});
