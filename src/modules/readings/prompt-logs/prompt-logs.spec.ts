import { Logger } from '@nestjs/common';
import { promptLogs } from '../../../database/drizzle/schema';
import { RequestContextService } from '../../logs';
import { AuthEventLogService } from './auth-event-log.service';
import { PromptLogService } from './prompt-log.service';

describe('PromptLogService & AuthEventLogService', () => {
  let valuesMock: jest.Mock;
  let dbMock: { insert: jest.Mock };
  let requestContext: RequestContextService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    valuesMock = jest.fn().mockResolvedValue(undefined);
    dbMock = { insert: jest.fn().mockReturnValue({ values: valuesMock }) };
    requestContext = new RequestContextService();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('AuthEventLogService persists userId, requestId and ipAddress into prompt_logs', async () => {
    const authEvents = new AuthEventLogService(dbMock as never, requestContext);

    await requestContext.run(
      {
        requestId: 'req-auth-1',
        ipAddress: '198.51.100.12',
        userAgent: 'Agent',
        country: null,
        httpMethod: 'POST',
        httpPath: '/api/v1/auth/login',
        startedAt: Date.now(),
      },
      async () => {
        await authEvents.logAuthEvent('user_login', 77);
      },
    );

    expect(dbMock.insert).toHaveBeenCalledWith(promptLogs);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        event: 'user_login',
        userId: 77,
        requestId: 'req-auth-1',
        ipAddress: '198.51.100.12',
      }),
    );
  });

  it('PromptLogService records requestId, ipAddress, provider and model and fails open on DB error', async () => {
    const prompts = new PromptLogService(dbMock as never, requestContext);

    await requestContext.run(
      {
        requestId: 'req-prompt-1',
        ipAddress: '203.0.113.20',
        userAgent: 'Agent',
        country: null,
        httpMethod: 'POST',
        httpPath: '/api/v1/readings',
        startedAt: Date.now() - 25,
      },
      async () => {
        await prompts.logPromptSuccess(
          'reading_evaluated',
          42,
          9,
          'eval:9',
          { score: 95 },
          { provider: 'google', model: 'gemini-3.5-flash-lite' },
        );
      },
    );

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'reading_evaluated',
        userId: 42,
        textId: 9,
        requestId: 'req-prompt-1',
        ipAddress: '203.0.113.20',
        provider: 'google',
        model: 'gemini-3.5-flash-lite',
      }),
    );

    valuesMock.mockRejectedValueOnce(new Error('db write failed'));
    await expect(
      prompts.logPromptError('text_generation_failed', 42, 'timeout', 'seed-x'),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
