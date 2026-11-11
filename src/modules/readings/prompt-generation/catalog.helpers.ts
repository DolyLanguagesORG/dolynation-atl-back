import type { CategoryConfig, CategoryId, CefrLevel, DifficultyLevel } from './catalog.types';
import {
  CEFR_BY_DIFFICULTY,
  CATEGORIES,
  UNIQUE_FOCUS_BY_CATEGORY,
  GENERIC_UNIQUE_FOCUS,
} from './catalog.constants';

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

export function formatCategoryName(raw: string): string {
  return raw
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function getCategoryConfig(id: string): CategoryConfig {
  const normalized = id.trim().toLowerCase();
  const cfg = CATEGORIES.find((c) => c.id.toLowerCase() === normalized);
  if (cfg) {
    return cfg;
  }
  const formatted = formatCategoryName(id);
  return {
    id: normalized as CategoryId,
    name: formatted,
    subcategories: [{ id: normalized, name: formatted }],
  };
}

export function getUniqueFocusForCategory(category: string): readonly string[] {
  const normalized = category.trim().toLowerCase() as CategoryId;
  const list = UNIQUE_FOCUS_BY_CATEGORY[normalized];
  if (list && list.length > 0) {
    return list;
  }
  return GENERIC_UNIQUE_FOCUS;
}
