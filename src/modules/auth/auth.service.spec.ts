import { Test } from '@nestjs/testing';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService, type PublicUser } from '../users/users.service';
import { AuthEventLogService } from '../readings/prompt-logs';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findById' | 'create' | 'verifyPassword' | 'toPublic'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let authEventLogService: jest.Mocked<Pick<AuthEventLogService, 'logAuthEvent'>>;

  const publicUserFixture: PublicUser = {
    id: 1,
    email: 'a@b.c',
    fullName: 'A B',
    currentStreak: 0,
    lastStreakDate: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
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
        if (key === 'JWT_ACCESS_TTL') return '15m';
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
      };
      usersService.findByEmail.mockResolvedValue(userRow);
      usersService.verifyPassword.mockResolvedValue(true);
      usersService.toPublic.mockReturnValue(publicUserFixture);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');

      const result = await service.login({ email: 'a@b.c', password: 'secret123' });

      expect(result.tokens.accessToken).toBe('access.jwt');
      expect(authEventLogService.logAuthEvent).toHaveBeenCalledWith('user_login', 1);
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
      };
      usersService.findByEmail.mockResolvedValue(userRow);
      usersService.verifyPassword.mockResolvedValue(false);
      await expect(service.login({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(
        AppHttpException,
      );
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
