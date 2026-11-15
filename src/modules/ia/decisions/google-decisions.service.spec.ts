import type { AppConfigService } from '../../../config/env.config';
import { GoogleDecisionsService } from './google-decisions.service';

describe('GoogleDecisionsService', () => {
  const originalFetch = global.fetch;

  const baseConfig = {
    ai: {
      google: {
        apiKey: 'AQ.test-key',
        decisions: {
          model: 'gemini-decision-1',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta/decisions',
          timeoutMs: 12_000,
        },
      },
    },
  } as unknown as AppConfigService;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reporta isConfigured() correctamente según exista GOOGLE_API_KEY', () => {
    const configured = new GoogleDecisionsService(baseConfig);
    expect(configured.isConfigured()).toBe(true);

    const missingKey = new GoogleDecisionsService({
      ai: { google: { apiKey: undefined } },
    } as unknown as AppConfigService);
    expect(missingKey.isConfigured()).toBe(false);
  });

  it('envía x-goog-api-key y parsea respuestas tipadas de choice, noul y score con 0 tokens de salida', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          answers: {
            gate: { type: 'noul', noul: 0.94, confidence: 0.94 },
            route: {
              type: 'choice',
              choice: 'history',
              probabilities: { history: 0.91, science: 0.09 },
              confidence: 0.91,
            },
            quality: {
              type: 'score',
              score: 1.85,
              probabilities: { '0': 0.05, '1': 0.05, '2': 0.9 },
              legend: { '0': 'low', '1': 'mid', '2': 'high' },
              confidence: 0.9,
            },
          },
          usage: {
            total_tokens: 120,
            total_input_tokens: 120,
            total_output_tokens: 0,
          },
        }),
    });
    global.fetch = fetchMock;

    const service = new GoogleDecisionsService(baseConfig);
    const result = await service.decide({
      input: 'Historia del Arte',
      questions: {
        gate: { type: 'noul', instructions: '¿Es educativo?' },
        route: {
          type: 'choice',
          instructions: 'Clasifica',
          criteria: { history: 'Historia', science: 'Ciencia' },
        },
        quality: {
          type: 'score',
          instructions: 'Califica',
          criteria: ['low', 'mid', 'high'],
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'AQ.test-key',
    });

    const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsedBody['model']).toBe('gemini-decision-1');
    expect(result.usage).toEqual({
      totalTokens: 120,
      totalInputTokens: 120,
      totalOutputTokens: 0,
    });
    expect(result.answers['gate']).toEqual({ type: 'noul', noul: 0.94, confidence: 0.94 });
    expect(result.answers['route']).toMatchObject({ type: 'choice', choice: 'history' });
    expect(result.answers['quality']).toMatchObject({ type: 'score', score: 1.85 });
  });

  it('expone helpers ergonómicos evaluateBool, classify y score', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            answers: { condition: { type: 'noul', noul: 0.82, confidence: 0.82 } },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            answers: {
              classification: {
                type: 'choice',
                choice: 'allow',
                probabilities: { allow: 0.98, reject: 0.02 },
                confidence: 0.98,
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            answers: {
              rubric: {
                type: 'score',
                score: 2,
                probabilities: { '0': 0, '1': 0, '2': 1 },
                legend: { '0': 'bad', '1': 'ok', '2': 'great' },
                confidence: 1,
              },
            },
          }),
      });
    global.fetch = fetchMock;

    const service = new GoogleDecisionsService(baseConfig);

    const gate = await service.evaluateBool({
      input: 'Cocina Mexicana',
      instructions: '¿Es válido?',
      threshold: 0.7,
    });
    expect(gate).toEqual({ passed: true, probability: 0.82, confidence: 0.82 });

    const choice = await service.classify({
      input: 'Cocina Mexicana',
      instructions: 'Clasifica',
      criteria: { allow: 'Válido', reject: 'Inválido' },
    });
    expect(choice.choice).toBe('allow');

    const rubric = await service.score({
      input: 'Cocina Mexicana',
      instructions: 'Puntúa',
      criteria: ['bad', 'ok', 'great'],
    });
    expect(rubric.score).toBe(2);
  });

  it('falla explícitamente si falta GOOGLE_API_KEY, si no hay preguntas o si HTTP no es OK', async () => {
    const noKey = new GoogleDecisionsService({
      ai: { google: {} },
    } as unknown as AppConfigService);

    await expect(
      noKey.decide({
        input: 'Test',
        questions: { q: { type: 'noul', instructions: 'Test?' } },
      }),
    ).rejects.toThrow('GOOGLE_API_KEY is not configured');

    const configured = new GoogleDecisionsService(baseConfig);
    await expect(configured.decide({ input: 'Test', questions: {} })).rejects.toThrow(
      /at least one question/i,
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Quota exceeded'),
    });

    await expect(
      configured.decide({
        input: 'Test',
        questions: { q: { type: 'noul', instructions: 'Test?' } },
      }),
    ).rejects.toThrow('Google Decisions API failed: 429 - Quota exceeded');
  });
});
