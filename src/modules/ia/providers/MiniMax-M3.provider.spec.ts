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

  it('añade response_format json_object cuando el prompt pide JSON y lo omite en chat libre', async () => {
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
    await provider.getFullResponse([{ role: 'user', content: 'Explica brevemente este concepto' }]);

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(firstBody.response_format).toEqual({ type: 'json_object' });
    expect(secondBody.response_format).toBeUndefined();
  });
});
