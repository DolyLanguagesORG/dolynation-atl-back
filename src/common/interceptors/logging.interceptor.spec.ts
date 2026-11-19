import { Logger, type ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { RequestContextService } from '../../modules/logs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs every successful HTTP request (including GET) to Pino with requestId, IP and userId', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const requestContext = new RequestContextService();
    const interceptor = new LoggingInterceptor(requestContext);

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/api/v1/readings/pending',
          url: '/api/v1/readings/pending',
          headers: { 'x-real-ip': '203.0.113.7', 'user-agent': 'VitestAgent' },
          user: { id: 42 },
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    await requestContext.run(
      {
        requestId: 'req-get-1',
        ipAddress: '203.0.113.7',
        userAgent: 'VitestAgent',
        country: 'MX',
        httpMethod: 'GET',
        httpPath: '/api/v1/readings/pending',
        startedAt: Date.now(),
        actorUserId: 42,
      },
      async () => {
        await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ ok: true }) }));
      },
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        logType: 'http',
        requestId: 'req-get-1',
        method: 'GET',
        url: '/api/v1/readings/pending',
        statusCode: 200,
        userId: 42,
        ipAddress: '203.0.113.7',
        userAgent: 'VitestAgent',
      }),
    );
  });
});
