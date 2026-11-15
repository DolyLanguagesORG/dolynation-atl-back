import type { AIRequestOptions, ProviderName } from '../ia/providers/ai-provider.interface';
import { LANGUAGE_NAMES } from './prompt-generation';

/** Resultado de la inspección determinista de pureza lingüística sobre textos generados. */
export interface LanguagePurityReport {
  clean: boolean;
  reasons: string[];
}

/** Opciones de respaldo rápido cuando el modelo principal mezcla idiomas o scripts. */
export const PURITY_FALLBACK_OPTIONS: AIRequestOptions = {
  model: 'MiniMax-M3',
  reasoningEffort: 'minimal',
  temperature: 0.7,
  maxTokens: 8192,
};

/** Segundo respaldo con razonamiento `low` reservado para cuando el primer reintento aún presenta defectos. */
export const PURITY_DEEP_FALLBACK_OPTIONS: AIRequestOptions = {
  model: 'MiniMax-M3',
  reasoningEffort: 'low',
  temperature: 0.65,
  maxTokens: 8192,
};

/** Secuencia ordenada de reintentos de pureza lingüística y recuperación JSON. */
export const PURITY_FALLBACK_SEQUENCE: readonly AIRequestOptions[] = [
  PURITY_FALLBACK_OPTIONS,
  PURITY_DEEP_FALLBACK_OPTIONS,
];

/**
 * Construye la secuencia de reintentos de pureza adaptada al proveedor activo o solicitado,
 * evitando enviar modelos específicos de MiniMax cuando la llamada usa Google u otro proveedor.
 */
export function buildPurityFallbackSequence(
  provider: ProviderName,
  overrides?: AIRequestOptions,
): AIRequestOptions[] {
  return PURITY_FALLBACK_SEQUENCE.map((base) => {
    if (provider === 'minimax') {
      return {
        ...base,
        ...overrides,
      };
    }

    return {
      provider,
      reasoningEffort: base.reasoningEffort,
      temperature: base.temperature,
      maxTokens: base.maxTokens,
      ...overrides,
    };
  });
}

/** Detecta escrituras no latinas (CJK, Hiragana/Katakana, Hangul, cirílico, árabe, griego). */
const NON_LATIN_SCRIPT_REGEX =
  /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\u0400-\u04FF\u0600-\u06FF\u0370-\u03FF]/u;

/** Detecta fugas de etiquetas de razonamiento o bloques Markdown dentro de valores ya parseados. */
const MARKUP_OR_THINK_REGEX = /<\/?think>|```/i;

/** Detecta tokens corruptos unidos por guion bajo en prosa natural (ej. `les_THRones`). */
const UNDERSCORE_TOKEN_GLITCH_REGEX = /\b[a-z\u00C0-\u024F]{2,}_[a-zA-Z\u00C0-\u024F]{2,}\b/;

/**
 * Detecta empalmes bilingües camelCase en minúscula inicial (ej. `cadaPreparation`, `contactosBetween`,
 * `seUnlocked`), sin penalizar marcas/nombres propios en mayúscula inicial (`JavaScript`, `YouTube`, `GitHub`).
 */
const CAMEL_CASE_GLITCH_REGEX = /\b[a-z\u00C0-\u024F]{2,}[A-Z][a-z]{2,}\b/;

/** Detecta JSON estructurado crudo filtrado por fallback en explicaciones o feedback. */
const RAW_JSON_LEAK_REGEX =
  /(?:^|\n)\s*\{[\s\S]*"(?:literalMeaning|explanation|wordBreakdown|otherWaysToSay|otherContexts)"\s*:/;

/** Frases meta o conectores inequívocamente ingleses fuera de lugar en textos en `es`/`fr`/`it`. */
const ENGLISH_META_PHRASE_REGEX =
  /\b(however,|therefore,|furthermore,|moreover,|meanwhile,|in addition,|for example,|in summary,|on the other hand,|the main idea|this passage|the user understood|in this context|refers to|it is used to)\b/i;

/** Conectores inequívocamente en español/francés/italiano fuera de lugar en lecturas en inglés. */
const NON_ENGLISH_PHRASE_REGEX =
  /\b(sin embargo|por lo tanto|además de|dans le cadre|c'est une|il s'agit de|tuttavia,|pertanto,|nella vita quotidiana)\b/i;

/**
 * Palabras funcionales exclusivamente inglesas (evaluadas en minúsculas exactas para evitar falsos
 * positivos con nombres propios en mayúsculas o palabras homógrafas en lenguas romances como `de`/`la`/`en`).
 */
const UNAMBIGUOUS_ENGLISH_STOPWORDS = new Set<string>([
  'the',
  'and',
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'which',
  'because',
  'however',
  'although',
  'therefore',
  'through',
  'between',
  'during',
  'without',
  'they',
  'their',
  'them',
  'should',
  'would',
  'could',
  'been',
  'were',
  'while',
  'against',
  'where',
  'when',
  'such',
  'other',
]);

/** Palabras léxicas inequívocamente inglesas (basta 1 aparición en textos en `es`/`fr`/`it`). */
const HIGH_SIGNAL_ENGLISH_PROSE_WORDS = new Set<string>([
  'deepen',
  'understanding',
  'explanation',
  'summarizes',
  'highlights',
  'demonstrates',
  'paragraph',
  'furthermore',
  'moreover',
  'meanwhile',
  'additionally',
  'specifically',
  'including',
  'regarding',
  'provides',
  'reflects',
  'whereas',
  'although',
  'instead',
  'overall',
  'effectively',
  'accurately',
  'thoroughly',
  'insight',
  'correctly',
  'elaboration',
  'preparation',
  'importance',
  'diversity',
  'communities',
  'community',
]);

/** Cognados válidos o deslizamientos ortográficos tolerados solo en francés. */
const FRENCH_ALLOWED_COGNATES = new Set<string>(['elaboration', 'preparation', 'importance']);

/**
 * Evalúa si un conjunto de fragmentos generados por IA respeta estrictamente el alfabeto latino
 * y el idioma objetivo (`es`, `en`, `fr`, `it`), detectando CJK, fugas de razonamiento o mezcla lingüística.
 */
export function inspectTextsPurity(
  texts: readonly (string | null | undefined)[],
  targetLanguage: string,
): LanguagePurityReport {
  const combined = texts
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .join('\n')
    .trim();

  if (!combined) {
    return { clean: true, reasons: [] };
  }

  const reasons: string[] = [];
  if (NON_LATIN_SCRIPT_REGEX.test(combined)) {
    reasons.push('non_latin_script_detected');
  }
  if (MARKUP_OR_THINK_REGEX.test(combined)) {
    reasons.push('reasoning_or_markup_leak');
  }
  if (RAW_JSON_LEAK_REGEX.test(combined)) {
    reasons.push('raw_json_leak');
  }
  if (UNDERSCORE_TOKEN_GLITCH_REGEX.test(combined)) {
    reasons.push('underscore_token_glitch');
  }
  if (CAMEL_CASE_GLITCH_REGEX.test(combined)) {
    reasons.push('camel_case_token_glitch');
  }

  const lang = targetLanguage.trim().toLowerCase();
  if (lang === 'es' || lang === 'fr' || lang === 'it') {
    if (ENGLISH_META_PHRASE_REGEX.test(combined)) {
      reasons.push('english_phrase_leak');
    }
    if (hasHighSignalEnglishWord(combined, lang)) {
      reasons.push('english_word_leak');
    }
    const englishStopwordHits = countUnambiguousLowercaseEnglishWords(combined);
    if (englishStopwordHits >= 2) {
      reasons.push('english_function_words_leak');
    }
  } else if (lang === 'en') {
    if (NON_ENGLISH_PHRASE_REGEX.test(combined)) {
      reasons.push('foreign_phrase_leak');
    }
  }

  return {
    clean: reasons.length === 0,
    reasons,
  };
}

function extractLatinWordTokens(text: string): string[] {
  return text.match(/[A-Za-z\u00C0-\u024F]+/g) ?? [];
}

function hasHighSignalEnglishWord(text: string, lang: string): boolean {
  for (const token of extractLatinWordTokens(text)) {
    if (!HIGH_SIGNAL_ENGLISH_PROSE_WORDS.has(token)) continue;
    if (lang === 'fr' && FRENCH_ALLOWED_COGNATES.has(token)) continue;
    return true;
  }
  return false;
}

function countUnambiguousLowercaseEnglishWords(text: string): number {
  let hits = 0;
  for (const token of extractLatinWordTokens(text)) {
    if (UNAMBIGUOUS_ENGLISH_STOPWORDS.has(token)) {
      hits += 1;
      if (hits >= 2) break;
    }
  }
  return hits;
}

/** Pondera la gravedad de los defectos detectados para elegir siempre la salida más limpia. */
export function scorePuritySeverity(reasons: readonly string[]): number {
  let score = 0;
  for (const reason of reasons) {
    if (reason === 'non_latin_script_detected' || reason === 'raw_json_leak') {
      score += 10;
    } else if (reason === 'reasoning_or_markup_leak') {
      score += 5;
    } else {
      score += 1;
    }
  }
  return score;
}

/** Construye una advertencia correctiva breve para el reintento automático de pureza lingüística. */
export function buildPurityCorrectionNote(
  targetLanguage: string,
  reasons: readonly string[],
): string {
  const langLabel = LANGUAGE_NAMES[targetLanguage.trim().toLowerCase()] ?? 'English';
  return `\nCRITICAL CORRECTION (previous attempt had ${reasons.join(', ')}): Keep internal reasoning concise and focused ONLY on verifying pure ${langLabel} and valid JSON syntax. Write 100% of every text value purely in natural ${langLabel} using Latin script only (avoid unescaped straight double quotes inside JSON strings; use «» or single quotes instead). Zero English words (for non-English targets), zero CJK/Cyrillic characters, zero camelCase splices, and zero underscore glitches.`;
}
