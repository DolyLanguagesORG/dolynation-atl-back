import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { DrizzleDb } from '../../database/database.module';
import { AppHttpException } from '../errors/app-http.exception';
import { ErrorCode } from '../errors/error-codes';
import { ALLOW_WITHOUT_SUBSCRIPTION_KEY } from '../decorators/allow-without-subscription.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SubscriptionGuard } from './subscription.guard';

describe('SubscriptionGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let dbMock: { select: jest.Mock };
  let guard: SubscriptionGuard;

  const createContext = (user?: { id: number; email: string }): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    dbMock = { select: jest.fn() };
    guard = new SubscriptionGuard(
      reflector as unknown as Reflector,
      dbMock as unknown as DrizzleDb,
    );
  });

  it('allows @Public() routes without querying the database', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === IS_PUBLIC_KEY);
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('allows @AllowWithoutSubscription() routes even when user has no plan yet', async () => {
    reflector.getAllAndOverride.mockImplementation(
      (key: string) => key === ALLOW_WITHOUT_SUBSCRIPTION_KEY,
    );
    await expect(guard.canActivate(createContext({ id: 7, email: 'u@x.com' }))).resolves.toBe(true);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('throws 403 SUBSCRIPTION_REQUIRED when user has subscriptionTier = null', async () => {
    dbMock.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ subscriptionTier: null }]),
        }),
      }),
    });

    let err: AppHttpException | null = null;
    try {
      await guard.canActivate(createContext({ id: 7, email: 'u@x.com' }));
    } catch (caught) {
      err = caught as AppHttpException;
    }
    expect(err).toBeInstanceOf(AppHttpException);
    expect(err?.getStatus()).toBe(403);
    expect(err?.getResponse()).toMatchObject({ code: ErrorCode.SUBSCRIPTION_REQUIRED });
  });

  it('allows access when user has a valid subscription tier', async () => {
    dbMock.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ subscriptionTier: 'dolly' }]),
        }),
      }),
    });

    await expect(guard.canActivate(createContext({ id: 7, email: 'u@x.com' }))).resolves.toBe(true);
  });
});
