import {
  isSupportedLanguageId,
  LANGUAGE_CHANGE_COOLDOWN_MS,
  SUPPORTED_LANGUAGE_IDS,
  type LanguageId,
} from './settings.constants';

const MS_PER_DAY = 86_400_000;

/**
 * Normaliza, valida y deduplica un arreglo de códigos de idioma respetando el orden de prioridad
 * (posición `0` = idioma más importante para el usuario).
 */
export function sanitizeSelectedLanguages(raw: unknown): LanguageId[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<LanguageId>();
  const sanitized: LanguageId[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim().toLowerCase();
    if (!isSupportedLanguageId(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    sanitized.push(normalized);
  }

  return sanitized;
}

/**
 * Devuelve los idiomas activos accesibles según la prioridad guardada y el cupo máximo del plan.
 * Cuando el plan habilita todos los idiomas soportados (p. ej. `dolly_pro` con cupo 4), expone
 * los 4 idiomas priorizando primero los configurados por el usuario y luego el resto del catálogo.
 */
export function resolveActiveLanguages(
  savedLanguages: readonly LanguageId[],
  maxLanguages: number,
): LanguageId[] {
  if (maxLanguages <= 0) {
    return [];
  }
  if (maxLanguages >= SUPPORTED_LANGUAGE_IDS.length) {
    const remaining = SUPPORTED_LANGUAGE_IDS.filter((lang) => !savedLanguages.includes(lang));
    return [...savedLanguages, ...remaining];
  }
  return savedLanguages.slice(0, maxLanguages);
}

/**
 * Indica si el usuario puede realizar un cambio gratuito de idioma según el bloqueo anual.
 */
export function canUseFreeAnnualChange(lastChangeAt: Date | null, now: Date = new Date()): boolean {
  if (!lastChangeAt) {
    return true;
  }
  return now.getTime() >= lastChangeAt.getTime() + LANGUAGE_CHANGE_COOLDOWN_MS;
}

/**
 * Devuelve la fecha en la que volverá a estar disponible el cambio anual gratuito,
 * o `null` si actualmente el cambio gratuito ya se encuentra habilitado.
 */
export function getNextFreeChangeAt(
  lastChangeAt: Date | null,
  now: Date = new Date(),
): Date | null {
  if (!lastChangeAt || canUseFreeAnnualChange(lastChangeAt, now)) {
    return null;
  }
  return new Date(lastChangeAt.getTime() + LANGUAGE_CHANGE_COOLDOWN_MS);
}

/**
 * Calcula los días restantes redondeados hacia arriba hasta una fecha futura.
 */
export function computeRemainingDays(targetDate: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((targetDate.getTime() - now.getTime()) / MS_PER_DAY));
}

/**
 * Verifica si dos listas deduplicadas de idiomas contienen exactamente el mismo conjunto de elementos.
 */
export function haveSameLanguageSet(a: readonly LanguageId[], b: readonly LanguageId[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setA = new Set(a);
  if (setA.size !== b.length) {
    return false;
  }
  return b.every((lang) => setA.has(lang));
}

/**
 * Compara igualdad exacta incluyendo orden entre dos arreglos de cadenas.
 */
export function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, idx) => value === b[idx]);
}
