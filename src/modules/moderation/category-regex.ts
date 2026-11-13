import { buildModerationVariants } from './category-normalizer';

/** Resultado de evaluación de la capa de expresiones regulares. */
export interface RegexCheckResult {
  blocked: boolean;
  ruleId?: string;
  reason?: string;
}

/** Acrónimos técnicos o académicos válidos sin vocales estándar que no deben bloquearse. */
const SAFE_NO_VOWEL_ACRONYMS = new Set<string>([
  'sql',
  'html',
  'css',
  'php',
  'http',
  'https',
  'tcp',
  'udp',
  'dns',
  'jwt',
  'npm',
  'xml',
  'yml',
  'yaml',
  'json',
  'rest',
  'grpc',
  'mvc',
  'mvvm',
  'llm',
  'nlp',
  'ml',
  'dl',
  'vr',
  'ar',
  'xr',
  'iot',
  'gps',
  'cpu',
  'gpu',
  'ram',
  'ssd',
  'hdd',
  'usb',
  'ssh',
  'tls',
  'ssl',
  'jwt',
  'crud',
  'orm',
  'tdd',
  'bdd',
  'ci',
  'cd',
  'aws',
  'gcp',
  'dna',
  'rna',
  'adhd',
  'ptsd',
  'stem',
  'pgsql',
  'mysql',
  'c++',
  'c#',
  'f#',
]);

/** Notaciones cortas de lenguajes de programación con símbolos permitidos (`C++`, `C#`, `F#`). */
const SAFE_PROGRAMMING_NOTATION_REGEX = /^(?:c\+\+|c#|f#)$/i;

/** Reglas regex para detectar gibberish, spam, prompt injection y contenido dañino. */
const URL_EMAIL_MARKUP_REGEX =
  /(?:https?:\/\/|www\.|<\/?[a-z][^>]*>|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\[[^\]]+\]\([^)]+\))/i;

const ALLOWED_CHARS_REGEX = /^[\p{L}\p{N}\s'&+#\-.,/()]+$/u;

const PROMPT_INJECTION_REGEX =
  /(?:ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions?|system\s*prompt|developer\s*prompt|jailbreak|do\s+anything\s+now|\bdan\b\s+mode|forget\s+(?:everything|all|your\s+rules)|act\s+as\s+(?:a|an|my)|you\s+are\s+now|bypass\s+(?:safety|filter|rules)|ignora\s+(?:todas?\s+)?(?:las?\s+)?instrucciones|olvida\s+(?:tus?\s+)?reglas|actua\s+como)/i;

const REPEATED_CHAR_SPAM_REGEX = /(.)\1{3,}/u;
const REPEATED_CHUNK_SPAM_REGEX = /\b([a-z0-9]{2,4})\1{2,}\b/i;
const REPEATED_PHRASE_CHUNK_REGEX = /^(.{2,6})(?:\s*\1){2,}$/i;
const REPEATED_WORD_TWO_REGEX = /^([a-z0-9]{2,})\s+\1$/i;
const REPEATED_WORD_THREE_REGEX = /\b([a-z0-9]{2,})\b(?:\s+\1){2,}/i;

const KEYBOARD_MASH_REGEX =
  /(?:qwert|werty|ertyu|rtyui|tyuio|yuiop|asdfg|sdfgh|dfghj|fghjk|ghjkl|zxcvb|xcvbn|cvbnm|qazws|wsxed|edcrf|rfvtg|tgbyh|yhnuj|ujmik|ikolp|trewq|gfdsa|nbvcx)/i;

const CONSONANT_RUN_REGEX = /[bcdfghjklmnpqrstvwxz]{7,}/i;
const CONSONANT_ONLY_LONG_TOKEN_REGEX = /^[bcdfghjklmnpqrstvwxz]{5,}$/i;

const FRAGMENTED_CHARS_REGEX = /(?:^|\s)(?:[a-z0-9]\s+){3,}[a-z0-9](?:\s|$)/i;

const OBFUSCATED_HARMFUL_REGEX =
  /\b(?:porn(?:o|ograf\w*)?|hentai|nsfw|xxx|nudes?|sex(?:o|ual\w*)?|suicid\w*|self[\s_-]*harm|auto[\s_-]*lesion\w*|(?:necro|pedo|zoo)fil\w*|decapit\w*|descuartiz\w*|mutila\w*|canibal\w*|cadaver\w*|corpse\w*|masacr\w*|massacr\w*)\b/i;

/**
 * Ejecuta el **Filtro 2 (Expresiones Regulares)** sobre una categoría dinámica.
 * Bloquea palabras sin sentido (gibberish), spam repetitivo, sobrecarga numérica/simbólica,
 * prompt injection y patrones dañinos u ofuscados.
 */
export function checkCategoryRegex(rawCategory: string): RegexCheckResult {
  const variants = buildModerationVariants(rawCategory);
  const cleaned = variants.cleaned;
  const isProgrammingNotation = SAFE_PROGRAMMING_NOTATION_REGEX.test(cleaned);

  // 1. Debe contener letras reales (mínimo 2 letras Unicode, salvo notaciones como C++ / C#)
  const letterCount = (cleaned.match(/\p{L}/gu) ?? []).length;
  if (!isProgrammingNotation && letterCount < 2) {
    return { blocked: true, ruleId: 'too_few_letters', reason: 'invalid_format_or_gibberish' };
  }

  // 2. Caracteres prohibidos o símbolos raros (control, emojis spam, código)
  if (!ALLOWED_CHARS_REGEX.test(cleaned)) {
    return {
      blocked: true,
      ruleId: 'disallowed_characters',
      reason: 'invalid_format_or_gibberish',
    };
  }

  // 3. URLs, correos, etiquetas HTML o enlaces Markdown
  if (URL_EMAIL_MARKUP_REGEX.test(cleaned)) {
    return { blocked: true, ruleId: 'url_email_or_markup', reason: 'prohibited_url_or_markup' };
  }

  // 4. Intentos de prompt injection sobre el generador de lecturas
  if (PROMPT_INJECTION_REGEX.test(variants.spaced) || PROMPT_INJECTION_REGEX.test(cleaned)) {
    return { blocked: true, ruleId: 'prompt_injection', reason: 'prohibited_prompt_injection' };
  }

  // 5. Exceso de dígitos o solo números/símbolos
  const digitCount = (cleaned.match(/\d/g) ?? []).length;
  const nonSpaceLength = cleaned.replace(/\s+/g, '').length;
  if (nonSpaceLength > 0 && digitCount >= 4 && digitCount / nonSpaceLength > 0.4) {
    return { blocked: true, ruleId: 'numeric_overload', reason: 'invalid_format_or_gibberish' };
  }

  // 6. Repetición excesiva de caracteres (aaaa, holapoooo, xdddd)
  if (REPEATED_CHAR_SPAM_REGEX.test(variants.asciiLower)) {
    return { blocked: true, ruleId: 'repeated_characters', reason: 'invalid_format_or_gibberish' };
  }

  // 7. Patrones repetitivos de sílabas o palabras (ababab, lololo, test test, bla bla bla)
  if (
    REPEATED_CHUNK_SPAM_REGEX.test(variants.spaced) ||
    REPEATED_PHRASE_CHUNK_REGEX.test(variants.spaced) ||
    REPEATED_WORD_TWO_REGEX.test(variants.spaced) ||
    REPEATED_WORD_THREE_REGEX.test(variants.spaced)
  ) {
    return { blocked: true, ruleId: 'repetitive_spam', reason: 'invalid_format_or_gibberish' };
  }

  // 8. Secuencias de teclas aleatorias (keyboard mashing)
  if (KEYBOARD_MASH_REGEX.test(variants.compact)) {
    return { blocked: true, ruleId: 'keyboard_mashing', reason: 'invalid_format_or_gibberish' };
  }

  // 9. Rachas largas de consonantes sin vocales ni acrónimos conocidos
  const tokens = variants.spaced.split(' ').filter((t) => t.length > 0);
  if (!isProgrammingNotation) {
    const hasConsonantGibberish = tokens.some((token) => {
      if (SAFE_NO_VOWEL_ACRONYMS.has(token)) return false;
      return CONSONANT_RUN_REGEX.test(token) || CONSONANT_ONLY_LONG_TOKEN_REGEX.test(token);
    });
    if (hasConsonantGibberish) {
      return {
        blocked: true,
        ruleId: 'consonant_gibberish',
        reason: 'invalid_format_or_gibberish',
      };
    }
  }

  // 10. Ofuscación por fragmentación de letras sueltas ("a b c d e", "p e n e")
  if (FRAGMENTED_CHARS_REGEX.test(variants.spaced)) {
    return {
      blocked: true,
      ruleId: 'fragmented_obfuscation',
      reason: 'invalid_format_or_gibberish',
    };
  }

  // 11. Patrones regex de términos dañinos/sexuales/autolesión con flexiones y separadores
  if (
    OBFUSCATED_HARMFUL_REGEX.test(variants.spaced) ||
    OBFUSCATED_HARMFUL_REGEX.test(variants.spacedLeet) ||
    OBFUSCATED_HARMFUL_REGEX.test(variants.singleCharJoined)
  ) {
    return {
      blocked: true,
      ruleId: 'obfuscated_harmful_pattern',
      reason: 'prohibited_harmful_pattern',
    };
  }

  return { blocked: false };
}
