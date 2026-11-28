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

  it('forwards explicit provider, model, and aiOptions to AIProviderFactory', async () => {
    factory.getFullResponse.mockResolvedValue('google-ok');

    const result = await service.getFullResponse([{ role: 'user', content: 'hola' }], {
      provider: 'google',
      aiOptions: { temperature: 0.3, maxTokens: 1024 },
    });

    expect(result).toBe('google-ok');
    expect(factory.getFullResponse).toHaveBeenCalledWith([{ role: 'user', content: 'hola' }], {
      provider: 'google',
      temperature: 0.3,
      maxTokens: 1024,
    });
  });

  describe('cuota agotada del provider (429)', () => {
    it('no reintenta y responde AI_RATE_LIMITED (429)', async () => {
      factory.getFullResponse.mockRejectedValue(
        new Error('Google request failed: 429 Too Many Requests - quota exceeded'),
      );

      const promise = service.getFullResponse([{ role: 'user', content: 'hi' }], {
        retries: 2,
        retryDelayMs: 0,
      });

      await expect(promise).rejects.toBeInstanceOf(AppHttpException);
      await expect(promise).rejects.toMatchObject({ status: 429 });
      // Un 429 no se arregla reintentando: solo gastaria mas cuota.
      expect(factory.getFullResponse).toHaveBeenCalledTimes(1);

      try {
        await service.getFullResponse([{ role: 'user', content: 'hi' }], {
          retries: 2,
          retryDelayMs: 0,
        });
        fail('expected AI_RATE_LIMITED');
      } catch (err) {
        const body = (err as AppHttpException).getResponse() as {
          code: ErrorCode;
          details?: { reason?: string };
        };
        expect(body.code).toBe(ErrorCode.AI_RATE_LIMITED);
        expect(body.details?.reason).toBe('ai-rate-limited');
      }
    });

    it('detecta el rate limit tambien por el texto del error', async () => {
      factory.getFullResponse.mockRejectedValue(
        new Error('Resource exhausted, rate limit reached'),
      );

      await expect(
        service.getFullResponse([{ role: 'user', content: 'hi' }], {
          retries: 3,
          retryDelayMs: 0,
        }),
      ).rejects.toMatchObject({ status: 429 });
      expect(factory.getFullResponse).toHaveBeenCalledTimes(1);
    });

    it('un fallo normal (5xx) si se reintenta', async () => {
      factory.getFullResponse.mockRejectedValue(new Error('boom'));

      await expect(
        service.getFullResponse([{ role: 'user', content: 'hi' }], {
          retries: 3,
          retryDelayMs: 0,
        }),
      ).rejects.toMatchObject({ status: 503 });
      expect(factory.getFullResponse).toHaveBeenCalledTimes(3);
    });

    it('relanza sin reintentar ni abrir el circuito cuando aborta la señal externa', async () => {
      for (let i = 0; i < 5; i += 1) {
        const localController = new AbortController();
        factory.getFullResponse.mockImplementationOnce(() => {
          localController.abort(new Error('client-disconnected'));
          return Promise.reject(new Error('aborted'));
        });
        await expect(
          service.getFullResponse([{ role: 'user', content: 'hi' }], {
            retries: 3,
            circuitFailureThreshold: 2,
            aiOptions: { signal: localController.signal },
          }),
        ).rejects.toThrow('aborted');
      }

      expect(factory.getFullResponse).toHaveBeenCalledTimes(5);
      expect(service.isDegraded({ circuitFailureThreshold: 2 })).toBe(false);
    });
  });
});
