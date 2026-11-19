import { sanitizeRecordForLog } from './log-sanitizer.util';

/** Resultado normalizado de comparar dos estados de una entidad. */
export interface StateDiffResult {
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  changedFields: string[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) {
      return false;
    }
    if (!deepEqual(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Sanitiza `before` y `after` y calcula los nombres de las propiedades cuyo valor
 * cambió entre ambos estados.
 */
export function computeStateDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): StateDiffResult {
  const beforeState = sanitizeRecordForLog(before);
  const afterState = sanitizeRecordForLog(after);

  if (!beforeState || !afterState) {
    return {
      beforeState,
      afterState,
      changedFields: [],
    };
  }

  const allKeys = new Set<string>([...Object.keys(beforeState), ...Object.keys(afterState)]);
  const changedFields: string[] = [];

  for (const key of allKeys) {
    if (!deepEqual(beforeState[key], afterState[key])) {
      changedFields.push(key);
    }
  }

  return {
    beforeState,
    afterState,
    changedFields,
  };
}
