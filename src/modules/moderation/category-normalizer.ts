import { CATEGORIES } from '../readings/prompt-generation/catalog.constants';

/** Variantes normalizadas de una categoría para detectar evasiones de formato o caracteres. */
export interface NormalizedCategoryVariants {
  cleaned: string;
  asciiLower: string;
  spaced: string;
  spacedLeet: string;
  collapsedToOne: string;
  collapsedToTwo: string;
  singleCharJoined: string;
  spacedSingleCharJoined: string;
  compact: string;
  compactCollapsed: string;
  compactCollapsedTwo: string;
}

const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\uFEFF\u00AD]/g;
const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

/** Mapa de homóglifos cirílicos y griegos comunes usados para evadir filtros de texto. */
const HOMOGLYPH_MAP: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  і: 'i',
  к: 'k',
  м: 'm',
  т: 't',
  в: 'b',
  н: 'h',
  α: 'a',
  ε: 'e',
  ο: 'o',
  ρ: 'p',
  ι: 'i',
  κ: 'k',
  τ: 't',
  υ: 'y',
  χ: 'x',
  ß: 'ss',
};

/** Mapa básico de sustituciones leetspeak para normalización de seguridad. */
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '+': 't',
  '|': 'i',
};

const CATALOG_ID_BY_CANONICAL = new Map<string, string>(
  CATEGORIES.flatMap((c) => [
    [canonicalCategoryKeyRaw(c.id), c.id],
    [canonicalCategoryKeyRaw(c.name), c.id],
  ]),
);

/**
 * Limpia espacios extremos, caracteres invisibles y múltiples espacios internos
 * preservando mayúsculas y acentos para mostrar o persistir la categoría.
 */
export function cleanCategoryDisplayName(raw: string): string {
  return raw.replace(INVISIBLE_CHARS_REGEX, '').trim().replace(/\s+/g, ' ');
}

/**
 * Convierte a minúsculas, descompone Unicode NFKC/NFD, elimina acentos/diéresis
 * y traduce homóglifos básicos a ASCII latino.
 */
export function stripDiacriticsAndHomoglyphs(raw: string): string {
  const nfkc = raw.replace(INVISIBLE_CHARS_REGEX, '').normalize('NFKC').toLowerCase();
  const mapped = Array.from(nfkc)
    .map((ch) => HOMOGLYPH_MAP[ch] ?? ch)
    .join('');
  return mapped.normalize('NFD').replace(COMBINING_MARKS_REGEX, '');
}

/** Sustituye dígitos y símbolos leetspeak habituales por letras equivalentes. */
function applyLeetSpeak(text: string): string {
  return Array.from(text)
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join('');
}

/**
 * Une secuencias consecutivas de tokens de 1 carácter (p. ej. `"m u e r t o"` → `"muerto"`),
 * evitando unir palabras completas inocentes entre sí.
 */
function joinSingleCharRuns(spacedText: string): string {
  const tokens = spacedText.split(' ').filter((t) => t.length > 0);
  const result: string[] = [];
  let buffer = '';

  for (const token of tokens) {
    if (token.length === 1) {
      buffer += token;
    } else {
      if (buffer.length > 0) {
        result.push(buffer);
        buffer = '';
      }
      result.push(token);
    }
  }
  if (buffer.length > 0) {
    result.push(buffer);
  }

  return result.join(' ');
}

function canonicalCategoryKeyRaw(raw: string): string {
  return stripDiacriticsAndHomoglyphs(cleanCategoryDisplayName(raw))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Genera la clave canónica insensible a mayúsculas, acentos, guiones y espacios extras.
 */
export function canonicalCategoryKey(raw: string): string {
  return canonicalCategoryKeyRaw(raw);
}

/** Indica si el valor corresponde a una categoría oficial predefinida del catálogo. */
export function isOfficialCatalogCategory(raw: string): boolean {
  return CATALOG_ID_BY_CANONICAL.has(canonicalCategoryKey(raw));
}

/**
 * Limpia y deduplica un listado de categorías conservando el orden de aparición
 * y unificando duplicados por su clave canónica.
 */
export function normalizeCategoryNames(categories: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of categories) {
    const cleaned = cleanCategoryDisplayName(raw);
    const key = canonicalCategoryKey(cleaned);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const catalogId = CATALOG_ID_BY_CANONICAL.get(key);
    normalized.push(catalogId ?? cleaned);
  }

  return normalized;
}

/**
 * Construye todas las variantes normalizadas (con espacios, sin acentos/diéresis,
 * con leetspeak, compacta sin espacios y con colapso de letras repetidas) para
 * que la blacklist y las regex detecten intentos de evasión.
 */
export function buildModerationVariants(raw: string): NormalizedCategoryVariants {
  const cleaned = cleanCategoryDisplayName(raw);
  const asciiLower = stripDiacriticsAndHomoglyphs(cleaned);

  const spaced = asciiLower
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const spacedLeet = applyLeetSpeak(asciiLower)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const collapsedToOne = spacedLeet.replace(/(.)\1+/g, '$1');
  const collapsedToTwo = spacedLeet.replace(/(.)\1{2,}/g, '$1$1');
  const singleCharJoined = joinSingleCharRuns(spacedLeet);
  const spacedSingleCharJoined = joinSingleCharRuns(spaced);

  const compact = spacedLeet.replace(/\s+/g, '');
  const compactCollapsed = compact.replace(/(.)\1+/g, '$1');
  const compactCollapsedTwo = compact.replace(/(.)\1{2,}/g, '$1$1');

  return {
    cleaned,
    asciiLower,
    spaced,
    spacedLeet,
    collapsedToOne,
    collapsedToTwo,
    singleCharJoined,
    spacedSingleCharJoined,
    compact,
    compactCollapsed,
    compactCollapsedTwo,
  };
}
