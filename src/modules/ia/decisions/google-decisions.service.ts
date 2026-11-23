import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import { fetchWithRetry } from '../providers/provider-retry';
import type {
  CreateDecisionRequest,
  CreateDecisionResponse,
  DecisionAnswer,
  DecisionChoiceAnswer,
  DecisionNoulAnswer,
  DecisionScoreAnswer,
  DecisionUsage,
} from './google-decisions.types';

/** Modelo predeterminado para solicitudes estructuradas de Google Decisions. */
const DEFAULT_DECISIONS_MODEL = 'gemini-decision-1';
/** Endpoint predeterminado de Google Decisions API. */
const DEFAULT_DECISIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions';
/** Tiempo máximo de espera cuando la configuración no define uno válido. */
const DEFAULT_DECISIONS_TIMEOUT_MS = 15_000;

interface DecisionsRuntimeConfig {
  apiKey: string | undefined;
  model: string;
  endpoint: string;
  timeoutMs: number;
}

/**
 * Cliente reutilizable para **Google Decisions API** (`gemini-decision-1`).
 *
 * Actúa como una compuerta condicional inteligente (`if`, clasificación cerrada `choice` o
 * rúbrica `score`) que devuelve probabilidades calibradas con **0 tokens de salida**,
 * evitando consumir la cuota de generación de texto (`gemini-3.5-flash-lite`) en tareas
 * de decisión o enrutamiento.
 */
@Injectable()
export class GoogleDecisionsService {
  private readonly logger = new Logger(GoogleDecisionsService.name);

  constructor(private readonly config: AppConfigService) {}

  /** Indica si `GOOGLE_API_KEY` está configurada para invocar Decisions API. */
  isConfigured(): boolean {
    return this.getRuntimeConfig().apiKey !== undefined;
  }

  /**
   * Evalúa una o más preguntas tipadas (`noul`, `choice`, `score`) sobre un mismo `input`.
   */
  async decide(request: CreateDecisionRequest): Promise<CreateDecisionResponse> {
    const questionKeys = Object.keys(request.questions);
    if (questionKeys.length === 0) {
      throw new Error('GoogleDecisionsService.decide requires at least one question');
    }

    const runtime = this.getRuntimeConfig();
    if (!runtime.apiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    const requestedModel = request.model?.trim();
    const model = requestedModel && requestedModel.length > 0 ? requestedModel : runtime.model;
    const timeoutMs = request.timeoutMs ?? runtime.timeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchWithRetry({
        url: runtime.endpoint,
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': runtime.apiKey,
          },
          body: JSON.stringify({
            model,
            input: request.input,
            questions: request.questions,
          }),
        },
        providerLabel: 'Google Decisions API',
        timeoutMs,
        signal: controller.signal,
        logger: this.logger,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '<no body>');
        throw new Error(`Google Decisions API failed: ${res.status} - ${errText}`);
      }

      const raw = (await res.json()) as unknown;
      return parseDecisionResponse(raw, this.logger);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Evalúa una condición booleana (`if` inteligente vía `noul`) y devuelve si supera el umbral.
   */
  async evaluateBool(params: {
    input: string;
    instructions: string;
    threshold?: number;
    model?: string;
    timeoutMs?: number;
  }): Promise<{ passed: boolean; probability: number; confidence: number }> {
    const threshold = params.threshold ?? 0.5;
    const response = await this.decide({
      input: params.input,
      questions: {
        condition: {
          type: 'noul',
          instructions: params.instructions,
        },
      },
      ...(params.model !== undefined ? { model: params.model } : {}),
      ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
    });

    const answer = response.answers['condition'];
    if (answer?.type !== 'noul') {
      throw new Error('Google Decisions API returned invalid answer for noul question');
    }

    return {
      passed: answer.noul >= threshold,
      probability: answer.noul,
      confidence: answer.confidence,
    };
  }

  /**
   * Clasifica el `input` en exactamente una opción de `criteria` (2..255 opciones).
   */
  async classify(params: {
    input: string;
    instructions: string;
    criteria: Record<string, string>;
    model?: string;
    timeoutMs?: number;
  }): Promise<DecisionChoiceAnswer> {
    const response = await this.decide({
      input: params.input,
      questions: {
        classification: {
          type: 'choice',
          instructions: params.instructions,
          criteria: params.criteria,
        },
      },
      ...(params.model !== undefined ? { model: params.model } : {}),
      ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
    });

    const answer = response.answers['classification'];
    if (answer?.type !== 'choice') {
      throw new Error('Google Decisions API returned invalid answer for choice question');
    }

    return answer;
  }

  /**
   * Evalúa el `input` contra una rúbrica ordenada (`score`) y devuelve puntaje y distribución.
   */
  async score(params: {
    input: string;
    instructions: string;
    criteria: readonly string[] | Record<string, string>;
    model?: string;
    timeoutMs?: number;
  }): Promise<DecisionScoreAnswer> {
    const response = await this.decide({
      input: params.input,
      questions: {
        rubric: {
          type: 'score',
          instructions: params.instructions,
          criteria: params.criteria,
        },
      },
      ...(params.model !== undefined ? { model: params.model } : {}),
      ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
    });

    const answer = response.answers['rubric'];
    if (answer?.type !== 'score') {
      throw new Error('Google Decisions API returned invalid answer for score question');
    }

    return answer;
  }

  /** Normaliza credenciales y opciones de Google Decisions con respaldos seguros. */
  private getRuntimeConfig(): DecisionsRuntimeConfig {
    const aiConfig = this.config.ai as
      | {
          google?: {
            apiKey?: string;
            decisions?: {
              model?: string;
              endpoint?: string;
              timeoutMs?: number;
            };
          };
        }
      | undefined;

    const google = aiConfig?.google;
    const rawKey = google?.apiKey;
    const apiKey =
      typeof rawKey === 'string' && rawKey.trim().length > 0 ? rawKey.trim() : undefined;
    const rawModel = google?.decisions?.model;
    const model =
      typeof rawModel === 'string' && rawModel.trim().length > 0
        ? rawModel.trim()
        : DEFAULT_DECISIONS_MODEL;
    const rawEndpoint = google?.decisions?.endpoint;
    const endpoint =
      typeof rawEndpoint === 'string' && rawEndpoint.trim().length > 0
        ? rawEndpoint.trim()
        : DEFAULT_DECISIONS_ENDPOINT;
    const rawTimeout = google?.decisions?.timeoutMs;
    const timeoutMs =
      typeof rawTimeout === 'number' && Number.isInteger(rawTimeout) && rawTimeout > 0
        ? rawTimeout
        : DEFAULT_DECISIONS_TIMEOUT_MS;

    return { apiKey, model, endpoint, timeoutMs };
  }
}

/** Valida la respuesta de decisiones, normaliza respuestas y registra el uso disponible. */
function parseDecisionResponse(raw: unknown, logger: Logger): CreateDecisionResponse {
  if (!isPlainObject(raw) || !isPlainObject(raw.answers)) {
    throw new Error('Google Decisions API returned empty answers payload');
  }

  const answers: Record<string, DecisionAnswer> = {};
  for (const [key, entry] of Object.entries(raw.answers)) {
    const parsed = parseDecisionAnswer(entry);
    if (parsed) {
      answers[key] = parsed;
    }
  }

  if (Object.keys(answers).length === 0) {
    throw new Error('Google Decisions API returned no parseable answers');
  }

  const usage = parseDecisionUsage(raw.usage);
  if (usage) {
    logger.debug({
      provider: 'Google-Decisions',
      inputTokens: usage.totalInputTokens,
      outputTokens: usage.totalOutputTokens,
    });
  }

  return {
    answers,
    ...(usage !== undefined ? { usage } : {}),
  };
}

/** Convierte una respuesta cruda en uno de los tipos de decisión soportados. */
function parseDecisionAnswer(raw: unknown): DecisionAnswer | null {
  if (!isPlainObject(raw)) return null;

  const type = raw.type;
  const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;

  if (type === 'noul' && typeof raw.noul === 'number') {
    const noulAnswer: DecisionNoulAnswer = {
      type: 'noul',
      noul: raw.noul,
      confidence,
    };
    return noulAnswer;
  }

  if (type === 'choice' && typeof raw.choice === 'string') {
    const choiceAnswer: DecisionChoiceAnswer = {
      type: 'choice',
      choice: raw.choice,
      probabilities: parseNumberMap(raw.probabilities),
      confidence,
    };
    return choiceAnswer;
  }

  if (type === 'score' && typeof raw.score === 'number') {
    const scoreAnswer: DecisionScoreAnswer = {
      type: 'score',
      score: raw.score,
      probabilities: parseNumberMap(raw.probabilities),
      legend: parseStringMap(raw.legend),
      confidence,
    };
    return scoreAnswer;
  }

  return null;
}

/** Extrae contadores de uso de la respuesta y omite la sección si no tiene forma válida. */
function parseDecisionUsage(raw: unknown): DecisionUsage | undefined {
  if (!isPlainObject(raw)) return undefined;
  return {
    totalTokens: typeof raw.total_tokens === 'number' ? raw.total_tokens : 0,
    totalInputTokens: typeof raw.total_input_tokens === 'number' ? raw.total_input_tokens : 0,
    totalOutputTokens: typeof raw.total_output_tokens === 'number' ? raw.total_output_tokens : 0,
  };
}

/** Filtra un objeto de probabilidades para conservar solo valores numéricos finitos. */
function parseNumberMap(raw: unknown): Record<string, number> {
  if (!isPlainObject(raw)) return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      result[k] = v;
    }
  }
  return result;
}

/** Filtra un objeto de etiquetas para conservar solo valores de texto. */
function parseStringMap(raw: unknown): Record<string, string> {
  if (!isPlainObject(raw)) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') {
      result[k] = v;
    }
  }
  return result;
}

/** Distingue objetos JSON planos de arreglos, valores nulos y primitivas. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
