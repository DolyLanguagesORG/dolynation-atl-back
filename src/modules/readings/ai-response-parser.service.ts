import { Injectable } from '@nestjs/common';

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

    const validList =
      allowedCategories && allowedCategories.length > 0
        ? allowedCategories.map((c) =>
            c
              .trim()
              .toLowerCase()
              .replace(/[\s-]+/g, '_'),
          )
        : ALLOWED_CATEGORIES;

    if (!validList.includes(categoryNormalized) && !validList.includes(categoryRaw.toLowerCase())) {
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
   * Extrae el primer objeto JSON presente en una cadena. Soporta bloques ````json`.
   * Balancea llaves respetando cadenas para evitar cortes prematuros cuando un texto incluye `}`.
   */
  private extractJson(text: string): unknown {
    const cleaned = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
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
