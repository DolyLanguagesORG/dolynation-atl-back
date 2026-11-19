import { CategoryAiModeratorService } from './category-ai-moderator.service';
import type { AppConfigService } from '../../config/env.config';
import type { DrizzleDb } from '../../database/database.module';
import type { GoogleDecisionsService } from '../ia/decisions/google-decisions.service';
import type { CreateDecisionRequest } from '../ia/decisions/google-decisions.types';
import type { AIProviderFactory } from '../ia/providers/ai-provider.factory';

describe('CategoryAiModeratorService (Filter 3)', () => {
  const originalFetch = global.fetch;

  let modConfig: AppConfigService['moderation'];
  let configMock: AppConfigService;
  let aiFactoryMock: jest.Mocked<Pick<AIProviderFactory, 'getFullResponse'>> & {
    resolveProviderName?: jest.Mock;
    get?: jest.Mock;
  };
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

  it('fails closed with 503 without caching transient external/AI errors, and succeeds on healthy retry', async () => {
    modConfig.openaiApiKey = 'sk-test-free';
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock;
    aiFactoryMock.getFullResponse.mockResolvedValueOnce('invalid-non-json-response');

    await expect(service.moderateBatch(['Literatura Latinoamericana'])).rejects.toMatchObject({
      status: 503,
    });

    // Since transient failures must NOT be cached, a healthy second attempt invokes AI and caches properly
    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      '{"results":[{"category":"Literatura Latinoamericana","allowed":true,"reason":"ok"}]}',
    );

    const retried = await service.moderateBatch(['Literatura Latinoamericana']);
    expect(retried).toEqual([{ category: 'Literatura Latinoamericana', allowed: true }]);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(2);
  });

  it('uses OpenAI only as safety gate in auto mode, escalating unflagged items to semantic check (blocking gibberish)', async () => {
    modConfig.aiProvider = 'auto';
    modConfig.aiEnabled = true;
    modConfig.openaiApiKey = 'sk-test-free';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { flagged: false, category_scores: { sexual: 0.001 } },
            { flagged: false, category_scores: { sexual: 0.001 } },
          ],
        }),
    });
    global.fetch = fetchMock;

    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      JSON.stringify({
        results: [
          { category: 'Astronomía Observacional', allowed: true, reason: 'ok' },
          {
            category: 'Especialidad capldgriwe 12',
            allowed: false,
            reason: 'nonsense_or_gibberish',
          },
        ],
      }),
    );

    const first = await service.moderateBatch([
      'Astronomía Observacional',
      'Especialidad capldgriwe 12',
    ]);
    expect(first).toEqual([
      { category: 'Astronomía Observacional', allowed: true },
      {
        category: 'Especialidad capldgriwe 12',
        allowed: false,
        layer: 'ai_moderation',
        reason: 'nonsense_or_gibberish',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);

    // Cached verdicts resolve with 0 external/AI calls
    const second = await service.moderateBatch([
      'astronomia observacional',
      'especialidad capldgriwe 12',
    ]);
    expect(second).toEqual([
      { category: 'astronomia observacional', allowed: true },
      {
        category: 'especialidad capldgriwe 12',
        allowed: false,
        layer: 'ai_moderation',
        reason: 'nonsense_or_gibberish',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);
  });

  it('enforces aiProvider=openai strictly (never calls LLM; fails closed on missing key or non-moderation URL)', async () => {
    modConfig.aiProvider = 'openai';
    modConfig.aiEnabled = true;
    modConfig.openaiApiKey = undefined;

    await expect(service.moderateBatch(['Historia Económica'])).rejects.toMatchObject({
      status: 503,
    });
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();

    // Even if someone points OPENAI_MODERATION_ENDPOINT to a paid /chat/completions endpoint, refuse it
    modConfig.openaiApiKey = 'sk-test-free';
    modConfig.openaiEndpoint = 'https://api.openai.com/v1/chat/completions';
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(service.moderateBatch(['Física Cuántica'])).rejects.toMatchObject({
      status: 503,
    });
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

  it('persists reusable CategoryPromptProfile in one moderation call, reuses globally across restarts, and lazily backfills legacy null profiles', async () => {
    const storedRows: Array<{
      canonicalKey: string;
      sampleCategory: string;
      allowed: boolean;
      layer: string | null;
      reason: string | null;
      provider: string;
      promptProfile: unknown;
      profileModel: string | null;
    }> = [];

    const dbMock = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => Promise.resolve([...storedRows])),
        }),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest
          .fn()
          .mockImplementation((rawRows: typeof storedRows | (typeof storedRows)[0]) => {
            const rows = Array.isArray(rawRows) ? rawRows : [rawRows];
            return {
              onConflictDoNothing: jest.fn().mockImplementation(() => {
                for (const row of rows) {
                  if (!storedRows.some((r) => r.canonicalKey === row.canonicalKey)) {
                    storedRows.push(row);
                  }
                }
                return Promise.resolve(undefined);
              }),
              onConflictDoUpdate: jest
                .fn()
                .mockImplementation(({ set }: { set: Record<string, unknown> }) => {
                  for (const row of rows) {
                    const existing = storedRows.find((r) => r.canonicalKey === row.canonicalKey);
                    if (existing) {
                      Object.assign(existing, set);
                    } else {
                      storedRows.push(row);
                    }
                  }
                  return Promise.resolve(undefined);
                }),
            };
          }),
      })),
    };

    const profileConfigMock = {
      get moderation() {
        return modConfig;
      },
      ai: {
        minimax: {
          model: 'MiniMax-M2.5',
        },
      },
    } as unknown as AppConfigService;

    const dbBacked = new CategoryAiModeratorService(
      profileConfigMock,
      aiFactoryMock as unknown as AIProviderFactory,
      dbMock as unknown as DrizzleDb,
    );

    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      JSON.stringify({
        results: [
          {
            category: 'Día de Muertos',
            allowed: true,
            reason: 'ok',
            blueprint: {
              displayName: 'Día de Muertos',
              editorialGuidance: 'Explore traditions, symbolism, and regional celebrations.',
              subtopics: ['Ofrendas y Altares', 'Flor de Cempasúchil', 'Calaveras Literarias'],
              uniqueFocusAngles: ['symbolic foods', 'regional origins'],
              coreConcepts: ['ofrenda', 'copal', 'cempasúchil', 'tradición'],
            },
          },
        ],
      }),
    );

    await dbBacked.moderateBatch(['Día de Muertos']);
    await dbBacked.ensureBlueprintsForApproved(['Día de Muertos']);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);
    expect(storedRows[0]?.profileModel).toBe('MiniMax-M2.5');

    // Simula otro usuario o reinicio: lee de Postgres con 0 llamadas a la IA
    dbBacked.clearCache();
    const reused = await dbBacked.getOrCreateCategoryProfile('dia de muertos');
    expect(reused?.subtopics).toContain('Ofrendas y Altares');
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);

    // Simula fila heredada aprobada con promptProfile = null (como "mariposas") -> backfill perezoso 1 sola vez
    storedRows.length = 0;
    storedRows.push({
      canonicalKey: 'mariposas',
      sampleCategory: 'mariposas',
      allowed: true,
      layer: null,
      reason: 'ok',
      provider: 'minimax',
      promptProfile: null,
      profileModel: null,
    });
    dbBacked.clearCache();
    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      JSON.stringify({
        displayName: 'Mariposas',
        editorialGuidance: 'Examine butterfly metamorphosis, migration, and ecology.',
        subtopics: ['Monarch Migration', 'Wing Pigmentation'],
        uniqueFocusAngles: ['navigational biology'],
        coreConcepts: ['metamorphosis', 'pollination', 'chrysalis'],
      }),
    );

    const backfilled = await dbBacked.getOrCreateCategoryProfile('mariposas');
    expect(backfilled?.displayName).toBe('Mariposas');
    expect(storedRows[0]?.promptProfile).toBeTruthy();
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(2);
  });

  it('uses Google without MiniMax-M2.5 override when Google is active or selected in code', async () => {
    const storedRows: Array<{
      canonicalKey: string;
      sampleCategory: string;
      allowed: boolean;
      layer: string | null;
      reason: string | null;
      provider: string;
      promptProfile: unknown;
      profileModel: string | null;
    }> = [];

    const dbMock = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => Promise.resolve([...storedRows])),
        }),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest
          .fn()
          .mockImplementation((rawRows: typeof storedRows | (typeof storedRows)[0]) => {
            const rows = Array.isArray(rawRows) ? rawRows : [rawRows];
            return {
              onConflictDoNothing: jest.fn().mockImplementation(() => {
                for (const row of rows) {
                  if (!storedRows.some((r) => r.canonicalKey === row.canonicalKey)) {
                    storedRows.push(row);
                  }
                }
                return Promise.resolve(undefined);
              }),
              onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
            };
          }),
      })),
    };

    const googleConfigMock = {
      get moderation() {
        return modConfig;
      },
      ai: {
        defaultProvider: 'google',
        google: {
          model: 'gemini-3.5-flash-lite',
        },
        minimax: {
          model: 'MiniMax-M2.7',
        },
      },
    } as unknown as AppConfigService;

    aiFactoryMock.resolveProviderName = jest.fn().mockReturnValue('google');

    const googleModerator = new CategoryAiModeratorService(
      googleConfigMock,
      aiFactoryMock as unknown as AIProviderFactory,
      dbMock as unknown as DrizzleDb,
    );

    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      JSON.stringify({
        results: [
          {
            category: 'Arquitectura Maya',
            allowed: true,
            reason: 'ok',
            blueprint: {
              displayName: 'Arquitectura Maya',
              editorialGuidance:
                'Explore Maya pyramids, urban planning, and astronomical alignments.',
              subtopics: ['Tikal', 'Palenque', 'Observatorios'],
              uniqueFocusAngles: ['solar alignments'],
              coreConcepts: ['estela', 'observatorio', 'bóveda'],
            },
          },
        ],
      }),
    );

    const decisions = await googleModerator.moderateBatch(['Arquitectura Maya']);
    expect(decisions).toEqual([{ category: 'Arquitectura Maya', allowed: true }]);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledWith(expect.any(Array), {
      provider: 'google',
      maxTokens: 2048,
      temperature: 0.4,
      disableThinking: true,
    });
    expect(storedRows[0]?.provider).toBe('google');
    expect(storedRows[0]?.profileModel).toBe('gemini-3.5-flash-lite');
  });

  it('usa gemini-decision-1 de forma aislada por categoría en modo auto sin gastar Flash-Lite en rechazos y genera blueprint solo al aprobar', async () => {
    const storedRows: Array<{
      canonicalKey: string;
      sampleCategory: string;
      allowed: boolean;
      layer: string | null;
      reason: string | null;
      provider: string;
      promptProfile: unknown;
      profileModel: string | null;
    }> = [];

    const dbMock = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => Promise.resolve([...storedRows])),
        }),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest
          .fn()
          .mockImplementation((rawRows: typeof storedRows | (typeof storedRows)[0]) => {
            const rows = Array.isArray(rawRows) ? rawRows : [rawRows];
            return {
              onConflictDoNothing: jest.fn().mockImplementation(() => {
                for (const row of rows) {
                  if (!storedRows.some((r) => r.canonicalKey === row.canonicalKey)) {
                    storedRows.push(row);
                  }
                }
                return Promise.resolve(undefined);
              }),
              onConflictDoUpdate: jest
                .fn()
                .mockImplementation(({ set }: { set: Record<string, unknown> }) => {
                  for (const row of rows) {
                    const existing = storedRows.find((r) => r.canonicalKey === row.canonicalKey);
                    if (existing) {
                      Object.assign(existing, set);
                    } else {
                      storedRows.push(row);
                    }
                  }
                  return Promise.resolve(undefined);
                }),
            };
          }),
      })),
    };

    const googleConfigMock = {
      get moderation() {
        return modConfig;
      },
      ai: {
        defaultProvider: 'google',
        google: {
          apiKey: 'AQ.test-key',
          model: 'gemini-3.5-flash-lite',
        },
        minimax: {
          model: 'MiniMax-M2.7',
        },
      },
    } as unknown as AppConfigService;

    aiFactoryMock.resolveProviderName = jest.fn().mockReturnValue('google');

    const decideMock = jest.fn().mockImplementation((req: CreateDecisionRequest) => {
      if (req.input.includes('Contenido Prohibido')) {
        return Promise.resolve({
          answers: {
            verdict: {
              type: 'choice',
              choice: 'unsafe_content',
              probabilities: { unsafe_content: 0.99, allow: 0.01 },
              confidence: 0.99,
            },
            safe_and_valid: { type: 'noul', noul: 0.01, confidence: 0.99 },
          },
        });
      }
      return Promise.resolve({
        answers: {
          verdict: {
            type: 'choice',
            choice: 'allow',
            probabilities: { allow: 0.99, unsafe_content: 0.01 },
            confidence: 0.99,
          },
          safe_and_valid: { type: 'noul', noul: 0.98, confidence: 0.98 },
        },
      });
    });

    const decisionsMock = {
      isConfigured: jest.fn().mockReturnValue(true),
      decide: decideMock,
    } as unknown as GoogleDecisionsService;

    const moderator = new CategoryAiModeratorService(
      googleConfigMock,
      aiFactoryMock as unknown as AIProviderFactory,
      dbMock as unknown as DrizzleDb,
      decisionsMock,
    );

    const verdicts = await moderator.moderateBatch(['Día de Muertos', 'Contenido Prohibido']);
    expect(verdicts).toEqual([
      { category: 'Día de Muertos', allowed: true },
      {
        category: 'Contenido Prohibido',
        allowed: false,
        layer: 'ai_moderation',
        reason: 'unsafe_content',
      },
    ]);
    // 1 llamada aislada por categoría hacia gemini-decision-1; 0 llamadas hacia Flash-Lite en moderación
    expect(decideMock).toHaveBeenCalledTimes(2);
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();
    expect(storedRows.find((r) => r.canonicalKey === 'contenido prohibido')?.provider).toBe(
      'google-decisions',
    );

    // El blueprint se genera 1 única vez solo para categorías aprobadas
    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      JSON.stringify({
        displayName: 'Día de Muertos',
        editorialGuidance: 'Explore cultural altars and traditions.',
        subtopics: ['Altares', 'Cempasúchil'],
        uniqueFocusAngles: ['regional roots'],
        coreConcepts: ['ofrenda', 'copal'],
      }),
    );

    await moderator.ensureBlueprintsForApproved(['Día de Muertos']);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);
    const approvedRow = storedRows.find((r) => r.canonicalKey === 'dia de muertos');
    expect(approvedRow?.provider).toBe('google-decisions');
    expect(approvedRow?.profileModel).toBe('gemini-3.5-flash-lite');
    expect(approvedRow?.promptProfile).toBeTruthy();
  });

  it('en auto pasa de OpenAI a Google Decisions, escala a Google generativo si Decisions falla/duda y aplica fail-closed si todo falla', async () => {
    modConfig.aiProvider = 'auto';
    modConfig.openaiApiKey = 'sk-free-openai';

    const googleAutoConfig = {
      get moderation() {
        return modConfig;
      },
      ai: {
        defaultProvider: 'google',
        google: {
          apiKey: 'AQ.test-key',
          model: 'gemini-3.5-flash-lite',
        },
      },
    } as unknown as AppConfigService;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{ flagged: false, category_scores: { sexual: 0.001 } }],
        }),
    });
    global.fetch = fetchMock;

    const decideMock = jest
      .fn()
      // 1. OpenAI pasa seguridad -> Decisions aprueba con alta confianza (0 tokens generativos)
      .mockResolvedValueOnce({
        answers: {
          verdict: {
            type: 'choice',
            choice: 'allow',
            probabilities: { allow: 0.96, nonsense_or_gibberish: 0.02 },
            confidence: 0.96,
          },
          safe_and_valid: { type: 'noul', noul: 0.95, confidence: 0.95 },
        },
      })
      // 2. OpenAI falla + Decisions falla por red -> escala a Google generativo
      .mockRejectedValueOnce(new Error('network timeout'))
      // 3. Decisions también falla -> luego falla Google generativo -> 503 fail-closed
      .mockRejectedValueOnce(new Error('network timeout'));

    const decisionsMock = {
      isConfigured: jest.fn().mockReturnValue(true),
      decide: decideMock,
    } as unknown as GoogleDecisionsService;

    const autoModerator = new CategoryAiModeratorService(
      googleAutoConfig,
      aiFactoryMock as unknown as AIProviderFactory,
      undefined,
      decisionsMock,
    );

    const openAiThenDecisions = await autoModerator.moderateBatch(['Historia del Cine']);
    expect(openAiThenDecisions).toEqual([{ category: 'Historia del Cine', allowed: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(aiFactoryMock.getFullResponse).not.toHaveBeenCalled();

    // Si OpenAI falla y Decision 1 falla, escala a Google generativo (`gemini-3.5-flash-lite`)
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      '{"results":[{"category":"Ebanistería CNC","allowed":true,"reason":"ok"}]}',
    );
    const escalatedToGoogleGen = await autoModerator.moderateBatch(['Ebanistería CNC']);
    expect(escalatedToGoogleGen).toEqual([{ category: 'Ebanistería CNC', allowed: true }]);
    expect(decideMock).toHaveBeenCalledTimes(2);
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(1);

    // Si OpenAI, Google Decisions y Google generativo fallan -> fail-closed 503 sin cachear
    fetchMock.mockRejectedValueOnce(new Error('openai down'));
    aiFactoryMock.getFullResponse.mockRejectedValueOnce(new Error('gemini down'));
    await expect(autoModerator.moderateBatch(['Cerámica Japonesa'])).rejects.toMatchObject({
      status: 503,
    });
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(2);

    // Modo dedicado `google-decisions`: no llama OpenAI aunque tenga clave y tampoco cae a LLM generativo; fail-closed si falta clave
    modConfig.aiProvider = 'google-decisions';
    modConfig.openaiApiKey = 'sk-free-openai';
    const decideMissingKey = {
      isConfigured: jest.fn().mockReturnValue(false),
      decide: jest.fn(),
    } as unknown as GoogleDecisionsService;

    const strictDecisionsModerator = new CategoryAiModeratorService(
      configMock,
      aiFactoryMock as unknown as AIProviderFactory,
      undefined,
      decideMissingKey,
    );
    await expect(
      strictDecisionsModerator.moderateBatch(['Robótica Educativa']),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(aiFactoryMock.getFullResponse).toHaveBeenCalledTimes(2);
  });

  it('performs lightweight safety-only moderation in system AI fallback without asking for reading blueprints', async () => {
    aiFactoryMock.getFullResponse.mockResolvedValueOnce(
      JSON.stringify({
        results: [{ category: 'Filosofía Contemporánea', allowed: true, reason: 'ok' }],
      }),
    );

    const moderator = new CategoryAiModeratorService(
      configMock,
      aiFactoryMock as unknown as AIProviderFactory,
    );

    const verdicts = await moderator.moderateBatch(['Filosofía Contemporánea']);
    expect(verdicts).toEqual([{ category: 'Filosofía Contemporánea', allowed: true }]);
    const [messages] = aiFactoryMock.getFullResponse.mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    expect(messages[0]?.content).toContain('You moderate user-requested reading categories');
    expect(messages[0]?.content).not.toContain('author a reusable editorial blueprint');
    expect(messages[0]?.content).not.toContain('"subtopics"');
  });
});
