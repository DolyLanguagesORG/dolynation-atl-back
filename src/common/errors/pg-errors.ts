const PG_UNIQUE_VIOLATION = '23505';

/**
 * Indica si el error proviene de una violación de índice único en PostgreSQL.
 *
 * Drizzle >= 0.44 envuelve el error del driver en `DrizzleQueryError` y deja el
 * error original de `pg` en `cause`, así que se revisan ambos niveles.
 */
export function isPgUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { code?: unknown }).code === PG_UNIQUE_VIOLATION) return true;
  const cause = (error as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}
