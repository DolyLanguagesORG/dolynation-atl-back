import type { CategoryConfig, CategoryId, CefrLevel, DifficultyLevel } from './catalog.types';
import { CEFR_BY_DIFFICULTY, CATEGORIES } from './catalog.constants';

export function pickRandom<T>(arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error('pickRandom called with empty array');
  }
  const idx = Math.floor(Math.random() * arr.length);
  const value = arr[idx];
  if (value === undefined) {
    throw new Error('pickRandom returned undefined despite non-empty array');
  }
  return value;
}

export function resolveCefrLevel(difficulty: DifficultyLevel): CefrLevel {
  const choices = CEFR_BY_DIFFICULTY[difficulty];
  const first = choices[0];
  if (!first) {
    throw new Error(`No CEFR levels mapped for difficulty "${difficulty}"`);
  }
  return first;
}

export function getCategoryConfig(id: CategoryId): CategoryConfig {
  const cfg = CATEGORIES.find((c) => c.id === id);
  if (!cfg) {
    throw new Error(`Unknown category "${id}"`);
  }
  return cfg;
}
