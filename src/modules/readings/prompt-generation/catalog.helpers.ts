import type { CategoryPromptProfile } from '../../../database/drizzle/types';
import type {
  CategoryConfig,
  CefrLevel,
  DifficultyLevel,
  ExplorationLens,
  RecentReadingSummary,
} from './catalog.types';
import {
  CEFR_BY_DIFFICULTY,
  GENERIC_UNIQUE_FOCUS,
  VERSATILE_EXPLORATION_LENSES,
} from './catalog.constants';

export interface SelectedBlueprintTopic {
  subtopic: string;
  uniqueFocusElement: string;
  keyConcepts: string[];
}

/** Crea un generador pseudoaleatorio determinista (FNV-1a + Mulberry32) a partir de una semilla. */
export function createSeededRng(seed: string): () => number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Selecciona aleatoriamente un elemento de un arreglo no vacío usando el generador provisto. */
export function pickRandom<T>(arr: readonly T[], rng: () => number = Math.random): T {
  if (arr.length === 0) {
    throw new Error('pickRandom called with empty array');
  }
  const idx = Math.floor(rng() * arr.length);
  const value = arr[idx];
  if (value === undefined) {
    throw new Error('pickRandom returned undefined despite non-empty array');
  }
  return value;
}

/** Resuelve el nivel CEFR principal asociado a la dificultad indicada. */
export function resolveCefrLevel(difficulty: DifficultyLevel): CefrLevel {
  const choices = CEFR_BY_DIFFICULTY[difficulty];
  const first = choices[0];
  if (!first) {
    throw new Error(`No CEFR levels mapped for difficulty "${difficulty}"`);
  }
  return first;
}

/** Da formato legible en Title Case al identificador crudo de una categoría. */
export function formatCategoryName(raw: string): string {
  return raw
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Obtiene la configuración dinámica de una categoría escrita por el usuario. */
export function getCategoryConfig(id: string): CategoryConfig {
  const normalized = id.trim().toLowerCase();
  const formatted = formatCategoryName(id);
  return {
    id: normalized,
    name: formatted,
    subcategories: [{ id: normalized, name: formatted }],
  };
}

/** Devuelve la lista de enfoques narrativos genéricos para cualquier categoría dinámica. */
export function getUniqueFocusForCategory(_category: string): readonly string[] {
  return GENERIC_UNIQUE_FOCUS;
}

/** Reduce un texto a tokens significativos sin acentos para comparar repetición temática. */
function tokenizeSignificantWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

/** Cuenta cuántos conceptos del candidato ya aparecen en las lecturas recientes. */
function scoreOverlap(candidate: string, recentTokens: ReadonlySet<string>): number {
  if (recentTokens.size === 0) return 0;
  let hits = 0;
  for (const token of tokenizeSignificantWords(candidate)) {
    if (recentTokens.has(token)) hits += 1;
  }
  return hits;
}

/** Elige aleatoriamente entre los candidatos con menor coincidencia temática reciente. */
function pickLeastRepeatedItem(
  candidates: readonly string[],
  recentTokens: ReadonlySet<string>,
): string {
  const scored = candidates.map((item) => ({ item, overlap: scoreOverlap(item, recentTokens) }));
  const minOverlap = Math.min(...scored.map((entry) => entry.overlap));
  const bestPool = scored
    .filter((entry) => entry.overlap === minOverlap)
    .map((entry) => entry.item);
  return pickRandom(bestPool);
}

/** Prioriza conceptos menos repetidos y devuelve una selección limitada para diversificar el prompt. */
function pickFreshConcepts(
  concepts: readonly string[],
  recentTokens: ReadonlySet<string>,
  limit = 4,
): string[] {
  if (concepts.length === 0) return [];
  const shuffled = [...concepts].sort(() => Math.random() - 0.5);
  return shuffled
    .map((item, idx) => ({ item, overlap: scoreOverlap(item, recentTokens), idx }))
    .sort((a, b) => a.overlap - b.overlap || a.idx - b.idx)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/** Frases que identifican lecturas introductorias o históricas ya cubiertas recientemente. */
const RECENT_BASICS_PATTERN =
  /\b(que\s+es|what\s+is|qu['’]?est[- ]ce|cos['’]?e|origen(?:es)?|origins?|introduccion|introduction|sincretismo|syncretism|fusion|definicion(?:es)?|definitions?|overview|basico?s?|basic|fundamentos?|fundamentals?|histoire\s+generale|storia\s+generale)\b/i;

/** Retira marcas diacríticas para detectar temas básicos sin depender de acentos. */
function foldAccentsForMatch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Selecciona ponderadamente una dimensión versátil para evitar repetir intros básicas o ángulos fallidos.
 */
export function pickExplorationLens(
  recentReadings: readonly RecentReadingSummary[] = [],
  excludedLensIds?: ReadonlySet<string>,
): ExplorationLens {
  const hasBasicsOrHistory =
    recentReadings.length >= 2 ||
    recentReadings.some((item) =>
      RECENT_BASICS_PATTERN.test(foldAccentsForMatch(`${item.title} ${item.description}`)),
    );

  const baseCandidates = VERSATILE_EXPLORATION_LENSES.filter(
    (lens) => !(lens.requiresFreshBasics && hasBasicsOrHistory),
  );
  const nonExcluded = excludedLensIds?.size
    ? baseCandidates.filter((lens) => !excludedLensIds.has(lens.id))
    : baseCandidates;
  const pool =
    nonExcluded.length > 0
      ? nonExcluded
      : baseCandidates.length > 0
        ? baseCandidates
        : VERSATILE_EXPLORATION_LENSES;

  const totalWeight = pool.reduce((sum, lens) => sum + Math.max(1, lens.weight), 0);
  let cursor = Math.random() * totalWeight;
  for (const lens of pool) {
    cursor -= Math.max(1, lens.weight);
    if (cursor <= 0) {
      return lens;
    }
  }
  return pickRandom(pool);
}

/**
 * Selecciona en memoria subtema, enfoque narrativo y conceptos clave de un blueprint global
 * evitando solapamientos léxicos con hasta las 10 lecturas recientes del usuario.
 */
export function selectBlueprintTopic(
  blueprint: CategoryPromptProfile,
  recentTitles: readonly string[] = [],
): SelectedBlueprintTopic {
  const recentTokens = new Set<string>(
    recentTitles.slice(0, 10).flatMap((title) => tokenizeSignificantWords(title)),
  );
  const subtopicPool =
    blueprint.subtopics.length > 0 ? blueprint.subtopics : [blueprint.displayName];
  const focusPool =
    blueprint.uniqueFocusAngles.length > 0 ? blueprint.uniqueFocusAngles : GENERIC_UNIQUE_FOCUS;

  return {
    subtopic: pickLeastRepeatedItem(subtopicPool, recentTokens),
    uniqueFocusElement: pickLeastRepeatedItem(focusPool, recentTokens),
    keyConcepts: pickFreshConcepts(blueprint.coreConcepts, recentTokens, 4),
  };
}
