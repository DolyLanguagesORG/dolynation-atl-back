import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;
  /** Permite alternar el flag `EMAIL_VERIFICATION_REQUIRED` entre pruebas. */
  let verificationRequired: boolean;

  beforeEach(async () => {
    verificationRequired = false;
    const usersServiceMock = {
      findById: jest.fn(),
    };
    const configMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'a'.repeat(64);
        if (key === 'JWT_ACCESS_TTL') return '5m';
        return undefined;
      }),
    } as unknown as ConfigService;

    const appConfigMock = {
      get mail() {
        return { verificationRequired };
      },
    } as unknown as AppConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: ConfigService, useValue: configMock },
        { provide: AppConfigService, useValue: appConfigMock },
      ],
    }).compile();

    strategy = moduleRef.get(JwtStrategy);
    usersService = moduleRef.get(UsersService);
  });

  it('returns the user when the JWT payload references a real user', async () => {
    const userRow = { id: 42, email: 'a@b.c', fullName: 'A B' };
    usersService.findById.mockResolvedValue(userRow as never);
    const payload = { sub: 42, email: 'a@b.c', type: 'access' as const };
    const result = await strategy.validate(payload);
    expect(result).toEqual<AuthUser>({ id: 42, email: 'a@b.c', fullName: 'A B' });
  });

  it('rejects a refresh token used as a bearer access token', async () => {
    const payload = { sub: 42, email: 'a@b.c', type: 'refresh' as const };
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);
    const payload = { sub: 999, email: 'gone@x.com', type: 'access' as const };
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unverified account when the email verification is required', async () => {
    verificationRequired = true;
    usersService.findById.mockResolvedValue({
      id: 42,
      email: 'a@b.c',
      fullName: 'A B',
      emailVerifiedAt: null,
    } as never);
    const payload = { sub: 42, email: 'a@b.c', type: 'access' as const };

    const error = await strategy.validate(payload).then(
      () => null,
      (caught: unknown) => caught as AppHttpException,
    );

    expect(error).toBeInstanceOf(AppHttpException);
    expect(error?.getResponse()).toMatchObject({ code: ErrorCode.AUTH_EMAIL_NOT_VERIFIED });
  });

  it('accepts a verified account when the email verification is required', async () => {
    verificationRequired = true;
    usersService.findById.mockResolvedValue({
      id: 42,
      email: 'a@b.c',
      fullName: 'A B',
      emailVerifiedAt: new Date(),
    } as never);
    const payload = { sub: 42, email: 'a@b.c', type: 'access' as const };

    const result = await strategy.validate(payload);

    expect(result).toEqual<AuthUser>({ id: 42, email: 'a@b.c', fullName: 'A B' });
  });

  it('accepts an unverified account when the email verification is not required', async () => {
    verificationRequired = false;
    usersService.findById.mockResolvedValue({
      id: 42,
      email: 'a@b.c',
      fullName: 'A B',
      emailVerifiedAt: null,
    } as never);
    const payload = { sub: 42, email: 'a@b.c', type: 'access' as const };

    const result = await strategy.validate(payload);

    expect(result).toEqual<AuthUser>({ id: 42, email: 'a@b.c', fullName: 'A B' });
  });
});
