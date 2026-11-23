/** Marcador común usado en registros cuando un campo sensible se oculta. */
const REDACTED = '[REDACTED]';
/** Profundidad máxima recorrida al sanitizar objetos anidados. */
const MAX_DEPTH = 8;
/** Cantidad máxima de elementos de un arreglo que se conserva en un registro. */
const MAX_ARRAY_ITEMS = 100;
/** Longitud total máxima de una cadena guardada en los registros. */
const MAX_STRING_LENGTH = 2000;
/** Prefijo visible conservado antes de marcar una cadena como truncada. */
const STRING_PREVIEW_LENGTH = 1000;

/** Nombres normalizados de propiedades que contienen credenciales o datos de sesión. */
const SENSITIVE_NORMALIZED_KEYS = new Set<string>([
  'password',
  'newpassword',
  'currentpassword',
  'oldpassword',
  'confirmpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'hash',
  'secret',
  'jwtsecret',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
  'xgoogapikey',
  'smtppassword',
  'privatekey',
  'clientsecret',
]);

/** Detecta nombres de propiedades que podrían contener credenciales o datos de sesión. */
function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_\s]/g, '').toLowerCase();
  if (SENSITIVE_NORMALIZED_KEYS.has(normalized)) {
    return true;
  }
  if (
    normalized.endsWith('password') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('tokenhash') ||
    normalized.endsWith('accesstoken') ||
    normalized.endsWith('refreshtoken')
  ) {
    return true;
  }
  return false;
}

/** Limita cadenas extensas para evitar registros desproporcionados. */
function truncateLongString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, STRING_PREVIEW_LENGTH)}... [truncated: total ${value.length} chars]`;
}

/** Sanitiza recursivamente valores, redacta secretos y corta ciclos o estructuras demasiado profundas. */
function sanitizeInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateLongString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateLongString(value.message),
    };
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'function') {
    return '[Function]';
  }
  if (typeof value !== 'object') {
    return '[Unsupported]';
  }
  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }
  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const sliced = value.slice(0, MAX_ARRAY_ITEMS);
      const mapped = sliced.map((item) => sanitizeInternal(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) {
        mapped.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`);
      }
      return mapped;
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (isSensitiveKey(k)) {
        result[k] = REDACTED;
      } else {
        result[k] = sanitizeInternal(v, depth + 1, seen);
      }
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

/**
 * Sanitiza recursivamente un valor arbitrario ocultando secretos, tokens y contraseñas,
 * serializando fechas a ISO y acotando cadenas excesivamente largas.
 */
export function sanitizeUnknownForLog(value: unknown): unknown {
  return sanitizeInternal(value, 0, new WeakSet<object>());
}

/**
 * Sanitiza un objeto plano para almacenarlo de forma segura en columnas JSONB
 * (`before_state`, `after_state`, `metadata`, `request_body`, `request_query`, `details`).
 */
export function sanitizeRecordForLog(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const sanitized = sanitizeInternal(value, 0, new WeakSet<object>());
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return null;
  }
  return sanitized as Record<string, unknown>;
}
