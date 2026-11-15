import type { AppConfigService } from '../../../config/env.config';
import { GoogleProvider } from './google.provider';

describe('GoogleProvider', () => {
  const originalFetch = global.fetch;

  const mockConfig = {
    ai: {
      defaultProvider: 'google',
      google: {
        apiKey: 'test-google-key',
        model: 'gemini-3.5-flash-lite',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        timeoutMs: 90_000,
        maxTokens: 8192,
        temperature: 0.7,
      },
    },
  } as unknown as AppConfigService;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('envía la petición compatible con OpenAI a Google AI Studio usando gemini-3.5-flash-lite', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: { content: '<think>plan</think>{"title":"Lectura limpia"}' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            total_tokens: 150,
            prompt_tokens: 100,
            completion_tokens: 50,
          },
        }),
    });
    global.fetch = fetchMock;

    const provider = new GoogleProvider(mockConfig);
    expect(provider.info).toEqual({
      name: 'Google-Gemini',
      model: 'gemini-3.5-flash-lite',
    });

    const result = await provider.getFullResponse([{ role: 'user', content: 'Escribe un texto' }]);
    expect(result).toBe('{"title":"Lectura limpia"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer test-google-key',
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      model: 'gemini-3.5-flash-lite',
      messages: [{ role: 'user', content: 'Escribe un texto' }],
      max_completion_tokens: 8192,
      temperature: 0.7,
      stream: false,
    });
  });

  it('mapea disableThinking=true a reasoning_effort=minimal en Gemini 3.5 Flash-Lite y a none en Gemini 2.5', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"allowed":true}' }, finish_reason: 'stop' }],
        }),
    });
    global.fetch = fetchMock;

    const provider = new GoogleProvider(mockConfig);
    await provider.getFullResponse([{ role: 'user', content: 'Modera esto' }], {
      disableThinking: true,
      maxTokens: 1536,
      temperature: 0.4,
    });
    await provider.getFullResponse([{ role: 'user', content: 'Modera legado' }], {
      model: 'gemini-2.5-flash-lite',
      disableThinking: true,
    });

    const gemini3Body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    const gemini25Body = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;

    expect(gemini3Body).toMatchObject({
      model: 'gemini-3.5-flash-lite',
      max_completion_tokens: 1536,
      temperature: 0.4,
      reasoning_effort: 'minimal',
    });
    expect(gemini25Body).toMatchObject({
      model: 'gemini-2.5-flash-lite',
      reasoning_effort: 'none',
    });
  });

  it('falla de forma explícita si falta GOOGLE_API_KEY al invocar el modelo', async () => {
    const missingKeyConfig = {
      ai: {
        ...mockConfig.ai,
        google: {
          ...mockConfig.ai.google,
          apiKey: undefined,
        },
      },
    } as unknown as AppConfigService;

    const provider = new GoogleProvider(missingKeyConfig);
    await expect(provider.getFullResponse([{ role: 'user', content: 'Hola' }])).rejects.toThrow(
      'GOOGLE_API_KEY is not configured',
    );
  });

  it('lanza error descriptivo cuando Gemini trunca la salida por límite de tokens sin contenido', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '' }, finish_reason: 'length' }],
        }),
    });

    const provider = new GoogleProvider(mockConfig);
    await expect(provider.getFullResponse([{ role: 'user', content: 'Hola' }])).rejects.toThrow(
      /Google Gemini truncated output at max_completion_tokens=8192/,
    );
  });

  it('emite fragmentos limpios de texto en streaming SSE e ignora chunks finales sin delta', async () => {
    const encoder = new TextEncoder();
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"Hola "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"mundo"}}]}\n\n',
      'data: {"choices":[],"usage":{"total_tokens":12}}\n\n',
      'data: [DONE]\n\n',
    ];
    let index = 0;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk: string | undefined = ssePayload[index];
        index += 1;
        if (chunk !== undefined) {
          controller.enqueue(encoder.encode(chunk));
        } else {
          controller.close();
        }
      },
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    const provider = new GoogleProvider(mockConfig);
    const parts: string[] = [];
    for await (const part of provider.streamChat([{ role: 'user', content: 'Saluda' }])) {
      parts.push(part);
    }

    expect(parts.join('')).toBe('Hola mundo');
  });
});
