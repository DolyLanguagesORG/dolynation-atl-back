import {
  computeBackoffDelayMs,
  DEFAULT_PROVIDER_RETRY_POLICY,
  fetchWithRetry,
  isRetryableStatus,
  type ProviderRetryPolicy,
} from './provider-retry';

/** Politica rapida para los tests: sin esperas reales entre reintentos. */
const FAST_POLICY: ProviderRetryPolicy = {
  attempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 2,
  jitterRatio: 0,
};

describe('providerRetry', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('trata 503 como transitorio y excluye 429 y 400', () => {
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
    // Un 429 significa cuota agotada: reintentar solo gastaria mas cuota.
    expect(isRetryableStatus(429)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
  });

  it('calcula esperas exponenciales con tope y jitter acotado', () => {
    const policy: ProviderRetryPolicy = {
      attempts: 5,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
      jitterRatio: 0.25,
    };

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const delay = computeBackoffDelayMs(attempt, policy);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(policy.maxDelayMs * 1.25);
    }

    // El primer reintento es el mas corto y los siguientes crecen.
    expect(computeBackoffDelayMs(1, { ...policy, jitterRatio: 0 })).toBe(1_000);
    expect(computeBackoffDelayMs(2, { ...policy, jitterRatio: 0 })).toBe(2_000);
    expect(computeBackoffDelayMs(3, { ...policy, jitterRatio: 0 })).toBe(4_000);
    expect(computeBackoffDelayMs(4, { ...policy, jitterRatio: 0 })).toBe(8_000);
    // A partir de ahi manda el tope.
    expect(computeBackoffDelayMs(9, { ...policy, jitterRatio: 0 })).toBe(8_000);
  });

  it('reintenta un 503 y devuelve la respuesta exitosa del siguiente intento', async () => {
    const okResponse = { ok: true, status: 200 } as unknown as Response;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('{"error":{"status":"UNAVAILABLE"}}'),
      })
      .mockResolvedValueOnce(okResponse);
    global.fetch = fetchMock;

    const res = await fetchWithRetry({
      url: 'https://example.test/chat',
      init: { method: 'POST' },
      providerLabel: 'Google Gemini',
      timeoutMs: 5_000,
      policy: FAST_POLICY,
    });

    expect(res).toBe(okResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no reintenta un 429 y devuelve el error del proveedor al llamador', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('Quota exceeded'),
    });
    global.fetch = fetchMock;

    const res = await fetchWithRetry({
      url: 'https://example.test/chat',
      init: { method: 'POST' },
      providerLabel: 'Google Gemini',
      timeoutMs: 5_000,
      policy: FAST_POLICY,
    });

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('agota los intentos y devuelve el ultimo 503 para que el llamador lo formatee', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.resolve('high demand'),
    });
    global.fetch = fetchMock;

    const res = await fetchWithRetry({
      url: 'https://example.test/chat',
      init: { method: 'POST' },
      providerLabel: 'Google Gemini',
      timeoutMs: 5_000,
      policy: FAST_POLICY,
    });

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(FAST_POLICY.attempts);
  });

  it('reintenta errores de red y relanza el ultimo cuando se agotan los intentos', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('socket hang up'));
    global.fetch = fetchMock;

    await expect(
      fetchWithRetry({
        url: 'https://example.test/chat',
        init: { method: 'POST' },
        providerLabel: 'Google Gemini',
        timeoutMs: 5_000,
        policy: FAST_POLICY,
      }),
    ).rejects.toThrow('socket hang up');

    expect(fetchMock).toHaveBeenCalledTimes(FAST_POLICY.attempts);
  });

  it('recupera la conexion tras un fallo de red y devuelve la respuesta valida', async () => {
    const okResponse = { ok: true, status: 200 } as unknown as Response;
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse);
    global.fetch = fetchMock;

    const res = await fetchWithRetry({
      url: 'https://example.test/chat',
      init: { method: 'POST' },
      providerLabel: 'Google Gemini',
      timeoutMs: 5_000,
      policy: FAST_POLICY,
    });

    expect(res).toBe(okResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('respeta el presupuesto total y no lanza un intento extra cuando se agota', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.resolve('high demand'),
    });
    global.fetch = fetchMock;

    await expect(
      fetchWithRetry({
        url: 'https://example.test/chat',
        init: { method: 'POST' },
        providerLabel: 'Google Gemini',
        timeoutMs: 0,
        policy: FAST_POLICY,
      }),
    ).rejects.toThrow(/timed out/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa por defecto un intento original mas dos reintentos', () => {
    expect(DEFAULT_PROVIDER_RETRY_POLICY.attempts).toBe(3);
    expect(DEFAULT_PROVIDER_RETRY_POLICY.baseDelayMs).toBe(1_000);
  });
});
