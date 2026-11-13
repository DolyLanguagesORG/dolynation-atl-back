import { CategoryAiModeratorService } from './category-ai-moderator.service';
import type { AppConfigService } from '../../config/env.config';
import type { DrizzleDb } from '../../database/database.module';
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
      aiProvider: 'auto',
      dailyCategoryLimit: 20,
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

  it('stops at OpenAI free moderation when OpenAI returns allowed=true in auto mode (0 MiniMax tokens spent)', async () => {
    modConfig.aiProvider = 'auto';
    modConfig.aiEnabled = true;
    modConfig.openaiApiKey = 'sk-test-free';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{ flagged: false, category_scores: { sexual: 0.001 } }],
        }),
    });
    global.fetch = fetchMock;

    const first = await service.moderateBatch(['Astronomía Observacional']);
    expect(first).toEqual([{ category: 'Astronomía Observacional', allowed: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();

    // Cached approval from OpenAI also avoids re-calling fetch on subsequent checks
    const second = await service.moderateBatch(['astronomia observacional']);
    expect(second).toEqual([{ category: 'astronomia observacional', allowed: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();
  });

  it('enforces aiProvider=openai strictly (free /moderations only, never calls MiniMax even on missing key or non-moderation URL)', async () => {
    modConfig.aiProvider = 'openai';
    modConfig.aiEnabled = true;
    modConfig.openaiApiKey = undefined;

    const missingKey = await service.moderateBatch(['Historia Económica']);
    expect(missingKey).toEqual([{ category: 'Historia Económica', allowed: true }]);
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();

    // Even if someone points OPENAI_MODERATION_ENDPOINT to a paid /chat/completions endpoint, refuse it
    modConfig.openaiApiKey = 'sk-test-free';
    modConfig.openaiEndpoint = 'https://api.openai.com/v1/chat/completions';
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const blockedPaidUrl = await service.moderateBatch(['Física Cuántica']);
    expect(blockedPaidUrl).toEqual([{ category: 'Física Cuántica', allowed: true }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();
  });

  it('routes directly to MiniMax when aiProvider=minimax and disables external APIs when aiProvider=none', async () => {
    modConfig.aiProvider = 'minimax';
    modConfig.openaiApiKey = 'sk-test-free';
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      '{"results":[{"category":"Química Orgánica","allowed":true,"reason":"ok"}]}',
    );
    const minimaxRes = await service.moderateBatch(['Química Orgánica']);
    expect(minimaxRes).toEqual([{ category: 'Química Orgánica', allowed: true }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);

    modConfig.aiProvider = 'none';
    const noneRes = await service.moderateBatch(['Término Totalmente Nuevo']);
    expect(noneRes).toEqual([{ category: 'Término Totalmente Nuevo', allowed: true }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);
  });

  it('persists AI verdicts in PostgreSQL moderated_categories and resolves across cold restarts with 0 AI calls', async () => {
    const storedRows: Array<{
      canonicalKey: string;
      sampleCategory: string;
      allowed: boolean;
      layer: string | null;
      reason: string | null;
      provider: string;
    }> = [];

    const dbMock = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => Promise.resolve([...storedRows])),
        }),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((rows: typeof storedRows) => {
          for (const row of rows) {
            if (!storedRows.some((r) => r.canonicalKey === row.canonicalKey)) {
              storedRows.push(row);
            }
          }
          return {
            onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
          };
        }),
      })),
    };

    const dbBackedService = new CategoryAiModeratorService(
      configMock,
      aiFactoryMock as unknown as AIProviderFactory,
      dbMock as unknown as DrizzleDb,
    );

    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      '{"results":[{"category":"Cinéma Nouvelle Vague","allowed":true,"reason":"ok"},{"category":"Tema Tabú Subtle","allowed":false,"reason":"unsafe_content"}]}',
    );

    const first = await dbBackedService.moderateBatch([
      'Cinéma Nouvelle Vague',
      'Tema Tabú Subtle',
    ]);
    expect(first).toEqual([
      { category: 'Cinéma Nouvelle Vague', allowed: true },
      {
        category: 'Tema Tabú Subtle',
        allowed: false,
        layer: 'ai_moderation',
        reason: 'unsafe_content',
      },
    ]);
    expect(storedRows).toHaveLength(2);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);

    // Simula reinicio del backend limpiando memoria L1: debe resolver desde Postgres sin llamar a MiniMax ni fetch
    dbBackedService.clearCache();
    const second = await dbBackedService.moderateBatch([
      'cinema nouvelle vague',
      'tema tabu subtle',
    ]);
    expect(second).toEqual([
      { category: 'cinema nouvelle vague', allowed: true },
      {
        category: 'tema tabu subtle',
        allowed: false,
        layer: 'ai_moderation',
        reason: 'unsafe_content',
      },
    ]);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);
  });
});
