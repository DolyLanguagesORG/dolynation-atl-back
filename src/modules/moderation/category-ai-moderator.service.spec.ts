import { CategoryAiModeratorService } from './category-ai-moderator.service';
import type { AppConfigService } from '../../config/env.config';
import type { AIProviderFactory } from '../ia/providers/ai-provider.factory';

describe('CategoryAiModeratorService (Filter 3)', () => {
  const originalFetch = global.fetch;

  let modConfig: AppConfigService['moderation'];
  let configMock: AppConfigService;
  let aiFactoryMock: jest.Mocked<Pick<AIProviderFactory, 'getFullResponse'>>;
  let service: CategoryAiModeratorService;

  beforeEach(() => {
    modConfig = {
      enabled: true,
      aiEnabled: true,
      scoreThreshold: 0.5,
      timeoutMs: 3000,
      cacheTtlMs: 60_000,
      openaiApiKey: undefined,
      openaiEndpoint: 'https://api.openai.com/v1/moderations',
      openaiModel: 'omni-moderation-latest',
      perspectiveApiKey: undefined,
    };

    configMock = {
      get moderation() {
        return modConfig;
      },
    } as unknown as AppConfigService;

    aiFactoryMock = {
      getFullResponse: jest.fn(),
    };

    service = new CategoryAiModeratorService(
      configMock,
      aiFactoryMock as unknown as AIProviderFactory,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses OpenAI Moderation API in batch, rejects flagged/high-score items, and caches verdicts', async () => {
    modConfig.openaiApiKey = 'sk-test-free';
    modConfig.aiEnabled = false;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { flagged: false, category_scores: { sexual: 0.01 } },
            { flagged: true, category_scores: { 'sexual/minors': 0.91 } },
          ],
        }),
    });
    global.fetch = fetchMock;

    const first = await service.moderateBatch(['Astronomía', 'Contenido Turbio']);
    expect(first).toEqual([
      { category: 'Astronomía', allowed: true },
      {
        category: 'Contenido Turbio',
        allowed: false,
        layer: 'openai_moderation',
        reason: 'moderation_sexual_minors',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Rejected items are cached so subsequent checks do not call OpenAI again
    const second = await service.moderateBatch(['contenido turbio']);
    expect(second).toEqual([
      {
        category: 'contenido turbio',
        allowed: false,
        layer: 'openai_moderation',
        reason: 'moderation_sexual_minors',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();
  });

  it('uses Perspective API when configured and rejects categories exceeding score threshold', async () => {
    modConfig.perspectiveApiKey = 'persp-test-key';
    modConfig.aiEnabled = false;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          attributeScores: {
            TOXICITY: { summaryScore: { value: 0.88 } },
          },
        }),
    });
    global.fetch = fetchMock;

    const result = await service.moderateBatch(['Insulto sutil']);
    expect(result).toEqual([
      {
        category: 'Insulto sutil',
        allowed: false,
        layer: 'perspective_api',
        reason: 'perspective_toxicity',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('batches uncached categories through the existing system AI, strips think tags, and caches results', async () => {
    aiFactoryMock.getFullResponse.mockResolvedValue(
      [
        '<think>Analyzing batch carefully.</think>',
        '```json',
        '{"results":[{"category":"Día de Muertos","allowed":true,"reason":"ok"},{"category":"Palabra Rara Sin Sentido","allowed":false,"reason":"nonsense_or_gibberish"}]}',
        '```',
      ].join('\n'),
    );

    const first = await service.moderateBatch(['Día de Muertos', 'Palabra Rara Sin Sentido']);
    expect(first).toEqual([
      { category: 'Día de Muertos', allowed: true },
      {
        category: 'Palabra Rara Sin Sentido',
        allowed: false,
        layer: 'ai_moderation',
        reason: 'nonsense_or_gibberish',
      },
    ]);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);

    // Second call with accent/case variation uses cached decision without extra LLM tokens
    const second = await service.moderateBatch(['Dia de Muertos']);
    expect(second).toEqual([{ category: 'Dia de Muertos', allowed: true }]);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);
  });

  it('skips system AI fallback when skipAiFallback is true', async () => {
    const result = await service.moderateBatch(['Historia Contemporánea'], {
      skipAiFallback: true,
    });

    expect(result).toEqual([{ category: 'Historia Contemporánea', allowed: true }]);
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();
  });

  it('fails open without caching transient external/AI errors', async () => {
    modConfig.openaiApiKey = 'sk-test-free';
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock;
    aiFactoryMock.getFullResponse.mockResolvedValueOnce('invalid-non-json-response');

    const first = await service.moderateBatch(['Literatura Latinoamericana']);
    expect(first).toEqual([{ category: 'Literatura Latinoamericana', allowed: true }]);

    // Since transient failures must NOT be cached, a healthy second attempt invokes AI and caches properly
    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      '{"results":[{"category":"Literatura Latinoamericana","allowed":true,"reason":"ok"}]}',
    );

    await service.moderateBatch(['Literatura Latinoamericana']);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(2);
  });
});
