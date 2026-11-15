import type { AppConfigService } from '../../../config/env.config';
import { MiniMaxProvider } from './MiniMax-M3.provider';

describe('MiniMaxProvider', () => {
  const originalFetch = global.fetch;

  const mockConfig = {
    ai: {
      defaultProvider: 'minimax',
      minimax: {
        apiKey: 'test-minimax-key',
        model: 'MiniMax-M3',
        endpoint: 'https://api.minimax.io/v1/chat/completions',
        timeoutMs: 90_000,
        maxTokens: 8192,
        temperature: 0.6,
        reasoningEffort: 'low',
      },
      groq: {
        apiKey: undefined,
        model: 'qwen/qwen3-32b',
      },
    },
  } as unknown as AppConfigService;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('envía reasoning_effort y reasoning_split: true para reducir latencia y separar razonamiento', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            { message: { content: '<think>plan</think>{"ok":true}' }, finish_reason: 'stop' },
          ],
          usage: {
            total_tokens: 120,
            prompt_tokens: 80,
            completion_tokens: 40,
            completion_tokens_details: { reasoning_tokens: 25 },
          },
        }),
    });
    global.fetch = fetchMock;

    const provider = new MiniMaxProvider(mockConfig);
    const result = await provider.getFullResponse([{ role: 'user', content: 'Hola' }]);

    expect(result).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsedBody).toMatchObject({
      model: 'MiniMax-M3',
      max_completion_tokens: 8192,
      temperature: 0.6,
      stream: false,
      reasoning_effort: 'low',
      reasoning_split: true,
    });
  });

  it('lanza error descriptivo si finish_reason=length dejó el contenido vacío', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '' }, finish_reason: 'length' }],
          usage: { total_tokens: 8200, prompt_tokens: 8, completion_tokens: 8192 },
        }),
    });

    const provider = new MiniMaxProvider(mockConfig);
    await expect(provider.getFullResponse([{ role: 'user', content: 'Hola' }])).rejects.toThrow(
      /max_completion_tokens=8192/,
    );
  });

  it('omite response_format json_object en MiniMax para evitar inyección CJK y usa top_p 0.95', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        }),
    });
    global.fetch = fetchMock;

    const provider = new MiniMaxProvider(mockConfig);
    await provider.getFullResponse([{ role: 'system', content: 'Respond ONLY with JSON' }]);

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(firstBody.response_format).toBeUndefined();
    expect(firstBody.top_p).toBe(0.95);
  });

  it('omite reasoning_effort en MiniMax-M2.5 y permite override puntual a MiniMax-M3', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        }),
    });
    global.fetch = fetchMock;

    const m25Config = {
      ...mockConfig,
      ai: {
        ...mockConfig.ai,
        minimax: {
          ...mockConfig.ai.minimax,
          model: 'MiniMax-M2.5',
          temperature: 0.85,
        },
      },
    } as typeof mockConfig;

    const provider = new MiniMaxProvider(m25Config);
    await provider.getFullResponse([{ role: 'user', content: 'Hola' }]);
    await provider.getFullResponse([{ role: 'user', content: 'Reintento limpio' }], {
      model: 'MiniMax-M3',
      reasoningEffort: 'low',
      temperature: 0.7,
    });

    const primaryBody = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    const fallbackBody = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;

    expect(primaryBody.model).toBe('MiniMax-M2.5');
    expect(primaryBody.reasoning_effort).toBeUndefined();
    expect(primaryBody.reasoning_split).toBe(true);
    expect(primaryBody.temperature).toBe(0.85);
    expect(primaryBody.top_p).toBe(0.95);

    expect(fallbackBody.model).toBe('MiniMax-M3');
    expect(fallbackBody.reasoning_effort).toBe('low');
    expect(fallbackBody.temperature).toBe(0.7);
  });

  it('permite ajustar maxTokens por llamada y desactiva thinking en MiniMax-M3 cuando disableThinking es true', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
    });
    global.fetch = fetchMock;

    const legacyProvider = new MiniMaxProvider(mockConfig);
    await legacyProvider.getFullResponse([{ role: 'user', content: 'Clasifica esto' }], {
      maxTokens: 512,
      disableThinking: true,
    });

    const flashConfig = {
      ...mockConfig,
      ai: {
        ...mockConfig.ai,
        minimax: {
          ...mockConfig.ai.minimax,
          model: 'MiniMax-M3.1-Flash',
        },
      },
    } as typeof mockConfig;
    const flashProvider = new MiniMaxProvider(flashConfig);
    await flashProvider.getFullResponse([{ role: 'user', content: 'Enriquece tema' }], {
      maxTokens: 1024,
      disableThinking: true,
    });

    const legacyBody = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    const flashBody = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;

    expect(legacyBody.max_completion_tokens).toBe(512);
    expect(legacyBody.thinking).toEqual({ type: 'disabled' });
    expect(legacyBody.reasoning_effort).toBeUndefined();

    expect(flashBody.max_completion_tokens).toBe(1024);
    expect(flashBody.thinking).toBeUndefined();
    expect(flashBody.reasoning_effort).toBe('low');
  });
});
