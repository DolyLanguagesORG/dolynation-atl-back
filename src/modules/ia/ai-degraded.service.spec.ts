import { AiDegradedService } from './ai-degraded.service';
import type { AIProviderFactory } from './providers/ai-provider.factory';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';

describe('AiDegradedService', () => {
  let factory: { getFullResponse: jest.Mock };
  let service: AiDegradedService;

  beforeEach(() => {
    factory = { getFullResponse: jest.fn() };
    service = new AiDegradedService(factory as unknown as AIProviderFactory);
  });

  it('returns the provider response on first success', async () => {
    factory.getFullResponse.mockResolvedValue('ok');
    const result = await service.getFullResponse([{ role: 'user', content: 'hi' }]);
    expect(result).toBe('ok');
    expect(factory.getFullResponse).toHaveBeenCalledTimes(1);
  });

  it('retries once and succeeds on the second attempt', async () => {
    factory.getFullResponse
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    const result = await service.getFullResponse([{ role: 'user', content: 'hi' }], {
      retries: 2,
      retryDelayMs: 0,
    });
    expect(result).toBe('recovered');
    expect(factory.getFullResponse).toHaveBeenCalledTimes(2);
  });

  it('throws SERVICE_UNAVAILABLE after exhausting retries', async () => {
    factory.getFullResponse.mockRejectedValue(new Error('boom'));

    const promise = service.getFullResponse([{ role: 'user', content: 'hi' }], {
      retries: 2,
      retryDelayMs: 0,
    });
    await expect(promise).rejects.toBeInstanceOf(AppHttpException);
    await expect(promise).rejects.toMatchObject({ status: 503 });
    expect(factory.getFullResponse).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after repeated failures and short-circuits further calls', async () => {
    factory.getFullResponse.mockRejectedValue(new Error('boom'));
    const options = { retries: 1, retryDelayMs: 0, circuitFailureThreshold: 2 } as const;

    await expect(service.getFullResponse([], options)).rejects.toBeInstanceOf(AppHttpException);
    await expect(service.getFullResponse([], options)).rejects.toBeInstanceOf(AppHttpException);

    expect(service.isDegraded(options)).toBe(true);

    // Third call should not reach the provider.
    factory.getFullResponse.mockClear();
    await expect(service.getFullResponse([], options)).rejects.toMatchObject({ status: 503 });
    expect(factory.getFullResponse).not.toHaveBeenCalled();
  });

  it('reports the error code on circuit-open failures', async () => {
    factory.getFullResponse.mockRejectedValue(new Error('boom'));
    const options = { retries: 1, retryDelayMs: 0, circuitFailureThreshold: 1 } as const;

    await expect(service.getFullResponse([], options)).rejects.toBeInstanceOf(AppHttpException);

    try {
      await service.getFullResponse([], options);
      fail('expected SERVICE_UNAVAILABLE');
    } catch (err) {
      expect(err).toBeInstanceOf(AppHttpException);
      const body = (err as AppHttpException).getResponse() as { code: ErrorCode };
      expect(body.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    }
  });
});
