import { BadRequestException, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { errorLogs } from '../../../database/drizzle/schema';
import { ErrorLogService } from '../error-log.service';
import { RequestContextService } from '../request-context.service';

describe('ErrorLogService', () => {
  let dbMock: { insert: jest.Mock };
  let valuesMock: jest.Mock;
  let requestContext: RequestContextService;
  let service: ErrorLogService;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    valuesMock = jest.fn().mockResolvedValue(undefined);
    dbMock = {
      insert: jest.fn().mockReturnValue({ values: valuesMock }),
    };
    requestContext = new RequestContextService();
    service = new ErrorLogService(dbMock as never, requestContext);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records 4xx validation/domain errors as warn with sanitized requestBody in Pino and DB', async () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      url: '/api/v1/auth/login',
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'cf-ipcountry': 'MX',
        'user-agent': 'Mozilla/5.0',
      },
      body: { email: 'user@example.com', password: 'plain-password-123' },
      query: {},
    } as unknown as Request;

    await requestContext.run(
      {
        requestId: 'req-err-400',
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        country: 'MX',
        httpMethod: 'POST',
        httpPath: '/api/v1/auth/login',
        startedAt: Date.now() - 5,
      },
      async () => {
        await service.logHttpException(new BadRequestException(['email - invalid']), req, {
          status: 400,
          body: {
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: 'Validation failed',
              details: { fields: [{ field: 'email', message: 'invalid' }] },
            },
          },
        });
      },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        logType: 'error',
        requestId: 'req-err-400',
        severity: 'warn',
        source: 'validation',
        module: 'auth',
        errorCode: ErrorCode.VALIDATION_ERROR,
      }),
    );
    expect(dbMock.insert).toHaveBeenCalledWith(errorLogs);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-err-400',
        severity: 'warn',
        source: 'validation',
        module: 'auth',
        errorCode: ErrorCode.VALIDATION_ERROR,
        httpStatus: 400,
        ipAddress: '203.0.113.10',
        requestBody: { email: 'user@example.com', password: '[REDACTED]' },
        details: { fields: [{ field: 'email', message: 'invalid' }], country: 'MX' },
      }),
    );
  });

  it('records 5xx unhandled exceptions as error with stack trace and fails open if DB rejects', async () => {
    valuesMock.mockRejectedValueOnce(new Error('pg unavailable'));
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/readings',
      url: '/api/v1/readings',
      headers: { 'x-real-ip': '198.51.100.4' },
      user: { id: 9, email: 'stu@example.com', role: 'student' },
    } as unknown as Request;

    const boom = new Error('postgres://secret-internal-dsn');
    await expect(
      service.logHttpException(boom, req, {
        status: 500,
        body: {
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'An unexpected error occurred.',
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        source: 'unhandled_exception',
        module: 'readings',
        actorUserId: 9,
      }),
    );
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        source: 'unhandled_exception',
        module: 'readings',
        actorUserId: 9,
        actorEmail: 'stu@example.com',
        errorStack: expect.stringContaining('postgres://secret-internal-dsn'),
      }),
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it('infers guard and AI provider sources properly', async () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/access-requests/me',
      headers: {},
    } as unknown as Request;

    await service.logHttpException(new AppHttpException(ErrorCode.SUBSCRIPTION_REQUIRED), req, {
      status: 403,
      body: { error: { code: ErrorCode.SUBSCRIPTION_REQUIRED, message: 'Plan required' } },
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'subscription_guard',
        module: 'access_requests',
        httpStatus: 403,
      }),
    );
  });
});
