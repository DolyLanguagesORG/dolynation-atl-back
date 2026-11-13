import { Injectable } from '@nestjs/common';
import type {
  AlternativeExpressionItem,
  ExplanationEntryType,
  UsageContextItem,
  WordBreakdownItem,
} from '../../database/drizzle/types';
import { canonicalCategoryKey } from '../moderation/category-normalizer';

/** Categoría textual normalizada de una lectura. */
export type TextCategory = string;
/** Niveles de dificultad válidos para una lectura generada. */
export type TextDifficulty = 'easy' | 'medium' | 'hard';

/** Estructura validada de una lectura generada por el modelo de IA. */
export interface GeneratedText {
  title: string;
  description: string;
  content: string;
  category: TextCategory;
  difficulty: TextDifficulty;
}

/** Resultado estructurado tras evaluar el resumen escrito por el usuario. */
export interface EvaluationResult {
  score: number;
  passed: boolean;
  feedback: string;
  /**
   * Respuesta del usuario que fue evaluada. La asigna `readings.service`
   * antes de persistir — el parser de IA no la devuelve (solo ve la entrada
   * como parte del prompt, no como campo de salida estructurado).
   * Exponerla en la interfaz permite al controlador devolverla al cliente
   * dentro del mismo `EvaluationResultDto`.
   */
  userResponse?: string;
}

/** Resultado estructurado de una explicación contextual (palabra u oración). */
export interface StructuredExplanationResult {
  literalMeaning: string | null;
  explanation: string;
  wordBreakdown: WordBreakdownItem[];
  otherWaysToSay: AlternativeExpressionItem[];
  otherContexts: UsageContextItem[];
}

const ALLOWED_CATEGORIES: TextCategory[] = [
  'technology',
  'history',
  'education',
  'programming',
  'culture',
  'pop_culture',
];
const ALLOWED_DIFFICULTIES: TextDifficulty[] = ['easy', 'medium', 'hard'];

/**
 * Convierte un valor JSON desconocido en `string`, lanzando error si no es primitivo.
 * Evita que `String(obj)` produzca silenciosamente `'[object Object]'` cuando el
 * LLM devuelve un objeto anidado en lugar de una cadena para un campo textual.
 */
function asString(value: unknown, field: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new Error(`Field '${field}' must be a string, got ${typeof value}`);
}

/**
 * Servicio encargado de extraer y validar las respuestas JSON emitidas por el proveedor de IA.
 */
@Injectable()
export class AiResponseParserService {
  /**
   * Parsea la respuesta JSON cruda de generación de lectura y valida categoría y dificultad.
   */
  parseGeneratedText(rawResponse: string, allowedCategories?: string[]): GeneratedText {
    const parsed = this.extractJson(rawResponse) as Record<string, unknown>;

    if (!parsed.title || !parsed.description || !parsed.content || !parsed.category) {
      throw new Error('Missing required fields in generated text response');
    }

    const categoryRaw = asString(parsed.category, 'category').trim();
    const categoryNormalized = categoryRaw.toLowerCase().replace(/[\s-]+/g, '_');
    const categoryCanonical = canonicalCategoryKey(categoryRaw);

    const validSource =
      allowedCategories && allowedCategories.length > 0 ? allowedCategories : ALLOWED_CATEGORIES;
    const validList = validSource.map((c) =>
      c
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_'),
    );
    const validCanonical = validSource.map((c) => canonicalCategoryKey(c)).filter(Boolean);

    if (
      !validList.includes(categoryNormalized) &&
      !validList.includes(categoryRaw.toLowerCase()) &&
      !(categoryCanonical.length > 0 && validCanonical.includes(categoryCanonical))
    ) {
      throw new Error(`Invalid category: ${categoryRaw}`);
    }
    const category = categoryNormalized;

    const difficultyRaw = asString(parsed.difficulty ?? '', 'difficulty').toLowerCase();
    const difficulty: TextDifficulty = ALLOWED_DIFFICULTIES.includes(
      difficultyRaw as TextDifficulty,
    )
      ? (difficultyRaw as TextDifficulty)
      : 'medium';

    return {
      title: asString(parsed.title, 'title'),
      description: asString(parsed.description, 'description'),
      content: asString(parsed.content, 'content'),
      category,
      difficulty,
    };
  }

  /**
   * Parsea la calificación y retroalimentación devueltas por la IA al evaluar un resumen.
   */
  parseEvaluation(rawResponse: string): EvaluationResult {
    const parsed = this.extractJson(rawResponse) as Record<string, unknown>;
    const rawScore = Number(parsed.score);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const feedback = asString(parsed.feedback ?? '', 'feedback');
    return {
      score,
      passed: score >= 80,
      feedback,
    };
  }

  /**
   * Extrae de forma segura la explicación de vocabulario incluso si el proveedor
   * antepone texto de control o etiquetas internas antes del bloque JSON.
   */
  parseExplanation(rawResponse: string): string {
    try {
      const parsed = this.extractJson(rawResponse) as { explanation?: unknown };
      if (parsed.explanation !== undefined && parsed.explanation !== null) {
        return asString(parsed.explanation, 'explanation').trim();
      }
    } catch {
      // Respaldo cuando el modelo devuelve texto plano sin objeto JSON
    }
    return this.stripProviderNoise(rawResponse);
  }

  /**
   * Parsea la respuesta enriquecida de ayuda contextual (desglose palabra por palabra,
   * sentido literal, explicación en la lectura, formas alternativas y otros contextos).
   * Mantiene compatibilidad total si el modelo responde únicamente `{"explanation": "..."}` o texto plano.
   */
  parseStructuredExplanation(
    rawResponse: string,
    fallbackWord: string,
    _entryType: ExplanationEntryType,
  ): StructuredExplanationResult {
    try {
      const parsed = this.extractJson(rawResponse) as Record<string, unknown>;
      const literalRaw = parsed.literalMeaning ?? parsed.literal_meaning;
      const literalMeaning = readOptionalText(literalRaw);

      const rawExplanation = readOptionalText(parsed.explanation);
      const explanation =
        rawExplanation ?? literalMeaning ?? (this.stripProviderNoise(rawResponse) || fallbackWord);

      const wordBreakdown = parseWordBreakdownList(parsed.wordBreakdown ?? parsed.word_breakdown);
      const otherWaysToSay = parseAlternativeList(
        parsed.otherWaysToSay ?? parsed.other_ways_to_say,
      );
      const otherContexts = parseUsageContextList(parsed.otherContexts ?? parsed.other_contexts);

      return {
        literalMeaning,
        explanation,
        wordBreakdown,
        otherWaysToSay,
        otherContexts,
      };
    } catch {
      return {
        literalMeaning: null,
        explanation: this.stripProviderNoise(rawResponse) || fallbackWord,
        wordBreakdown: [],
        otherWaysToSay: [],
        otherContexts: [],
      };
    }
  }

  private stripProviderNoise(rawResponse: string): string {
    return rawResponse
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
  }

  /**
   * Extrae el primer objeto JSON presente en una cadena. Soporta bloques ````json`.
   * Balancea llaves respetando cadenas para evitar cortes prematuros cuando un texto incluye `}`.
   */
  private extractJson(text: string): unknown {
    const cleaned = this.stripProviderNoise(text);
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace === -1) {
      throw new Error('No JSON object found in response');
    }
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = firstBrace; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          return JSON.parse(cleaned.slice(firstBrace, i + 1)) as unknown;
        }
      }
    }
    throw new Error('Unterminated JSON object in response');
  }
}

function readOptionalText(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function parseWordBreakdownList(raw: unknown): WordBreakdownItem[] {
  if (!Array.isArray(raw)) return [];
  const items: WordBreakdownItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const token = readOptionalText(record.token ?? record.word);
    const literalDefinition = readOptionalText(
      record.literalDefinition ?? record.literal_definition ?? record.definition,
    );
    if (!token || !literalDefinition) continue;
    const lemma = readOptionalText(record.lemma ?? record.baseForm ?? record.base_form) ?? token;
    const partOfSpeech =
      readOptionalText(record.partOfSpeech ?? record.part_of_speech ?? record.category) ?? '';
    const roleInPhrase = readOptionalText(record.roleInPhrase ?? record.role_in_phrase);
    items.push({
      token,
      lemma,
      partOfSpeech,
      literalDefinition,
      ...(roleInPhrase ? { roleInPhrase } : {}),
    });
  }
  return items;
}

function parseAlternativeList(raw: unknown): AlternativeExpressionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: AlternativeExpressionItem[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (text) items.push({ expression: text, note: '' });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const expression = readOptionalText(record.expression ?? record.phrase ?? record.alternative);
    if (!expression) continue;
    const register = readOptionalText(record.register ?? record.tone);
    const note = readOptionalText(record.note ?? record.explanation) ?? '';
    items.push({
      expression,
      ...(register ? { register } : {}),
      note,
    });
  }
  return items;
}

function parseUsageContextList(raw: unknown): UsageContextItem[] {
  if (!Array.isArray(raw)) return [];
  const items: UsageContextItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const contextLabel = readOptionalText(
      record.contextLabel ?? record.context_label ?? record.context ?? record.situation,
    );
    const explanation = readOptionalText(record.explanation ?? record.meaning);
    const example = readOptionalText(record.example ?? record.sentence);
    if (!contextLabel && !explanation && !example) continue;
    items.push({
      contextLabel: contextLabel ?? '',
      explanation: explanation ?? '',
      example: example ?? '',
    });
  }
  return items;
}
