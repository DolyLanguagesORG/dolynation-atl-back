import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;

  beforeEach(async () => {
    const usersServiceMock = {
      findById: jest.fn(),
    };
    const configMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'a'.repeat(64);
        if (key === 'JWT_ACCESS_TTL') return '15m';
        return undefined;
      }),
    } as unknown as ConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    strategy = moduleRef.get(JwtStrategy);
    usersService = moduleRef.get(UsersService);
  });

  it('returns the user when the JWT payload references a real user', async () => {
    const userRow = { id: 42, email: 'a@b.c', fullName: 'A B' };
    usersService.findById.mockResolvedValue(userRow as never);
    const payload = { sub: 42, email: 'a@b.c' };
    const result = await strategy.validate(payload);
    expect(result).toEqual<AuthUser>({ id: 42, email: 'a@b.c', fullName: 'A B' });
  });

  it('throws UnauthorizedException when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);
    const payload = { sub: 999, email: 'gone@x.com' };
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
