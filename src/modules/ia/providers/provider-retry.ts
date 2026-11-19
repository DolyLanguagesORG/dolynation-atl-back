import type { Logger } from '@nestjs/common';

/**
 * Codigos HTTP transitorios: el proveedor esta momentaneamente sin capacidad
 * o su infraestructura falla de forma temporal.
 *
 * El `503 UNAVAILABLE` es el caso tipico de Gemini en el Free Tier. Google lo
 * describe como "the service is temporarily running out of capacity" y su guia
 * oficial pide reintentar con backoff exponencial cuando la respuesta es un
 * `429 RESOURCE_EXHAUSTED` o un `503 UNAVAILABLE`.
 *
 * El `429` queda **fuera** a proposito: un 429 significa cuota agotada, que no
 * se libera esperando unos segundos, asi que reintentar solo gastaria mas
 * cuota. Es la misma decision ya documentada en `AiDegradedService.isRateLimited`.
 */
export const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([500, 502, 503, 504, 529]);

/** Politica de reintentos con backoff exponencial y jitter. */
export interface ProviderRetryPolicy {
  /** Numero total de intentos, contando el original. */
  attempts: number;
  /** Espera del primer reintento; cada uno duplica la anterior. */
  baseDelayMs: number;
  /** Tope de la espera entre reintentos. */
  maxDelayMs: number;
  /** Proporcion de jitter aleatorio (`0.25` = +/-25%) para no sincronizar clientes. */
  jitterRatio: number;
}

/**
 * Politica por defecto: el intento original mas dos reintentos con esperas de
 * ~1s y ~2s (con jitter), siguiendo la guia oficial de Gemini (1s, 2s, 4s, 8s).
 */
export const DEFAULT_PROVIDER_RETRY_POLICY: ProviderRetryPolicy = {
  attempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  jitterRatio: 0.25,
};

/** Indica si un codigo HTTP es transitorio y merece un reintento. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Calcula la espera antes del reintento `attempt` (1 = primer reintento):
 * backoff exponencial limitado a `maxDelayMs`, mas un jitter aleatorio para que
 * varios clientes no reintenten a la vez.
 */
export function computeBackoffDelayMs(
  attempt: number,
  policy: ProviderRetryPolicy = DEFAULT_PROVIDER_RETRY_POLICY,
): number {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  const jitter = exponential * policy.jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

/** Parametros de una peticion HTTP con reintentos ante fallos transitorios. */
export interface FetchWithRetryParams {
  url: string;
  init: RequestInit;
  /** Etiqueta del proveedor, usada en los logs y en el error final. */
  providerLabel: string;
  /** Timeout de cada intento individual. */
  timeoutMs: number;
  /**
   * Presupuesto total de la operacion (todos los intentos sumados).
   * Por defecto es igual a `timeoutMs`, de modo que el tiempo maximo que
   * espera el cliente no cambia respecto a una peticion sin reintentos.
   */
  totalBudgetMs?: number;
  policy?: ProviderRetryPolicy;
  logger?: Logger;
  /**
   * Senal externa que aborta la peticion. Permite que el llamador mantenga su
   * propio limite de tiempo sobre la operacion completa (por ejemplo, el
   * consumo de un stream SSE), no solo sobre la respuesta inicial.
   */
  signal?: AbortSignal;
}

/**
 * Ejecuta la peticion HTTP reintentando los fallos transitorios del proveedor
 * con backoff exponencial y jitter.
 *
 * Devuelve la `Response` del ultimo intento para que el llamador conserve su
 * formato de error original (`<label> request failed: <status> - <body>`).
 * Los errores de red se relanzan tal cual cuando se agotan los intentos.
 */
export async function fetchWithRetry(params: FetchWithRetryParams): Promise<Response> {
  const policy = params.policy ?? DEFAULT_PROVIDER_RETRY_POLICY;
  const budgetMs = params.totalBudgetMs ?? params.timeoutMs;
  const deadline = Date.now() + budgetMs;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw (
        lastError ?? new Error(`${params.providerLabel} request timed out after ${budgetMs} ms`)
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(params.timeoutMs, remainingMs));
    const abortFromExternal = (): void => controller.abort();
    params.signal?.addEventListener('abort', abortFromExternal, { once: true });
    let delayMs = 0;
    let reason = '';

    try {
      const res = await fetch(params.url, {
        ...params.init,
        signal: controller.signal,
      });

      if (!isRetryableStatus(res.status) || attempt === policy.attempts) {
        return res;
      }

      // La respuesta fallida se descarta: se lee su cuerpo para liberar el
      // socket antes de esperar al siguiente intento.
      await res.text().catch(() => undefined);
      reason = `HTTP ${res.status}`;
      delayMs = computeBackoffDelayMs(attempt, policy);
    } catch (err) {
      const normalizedErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === policy.attempts) {
        throw normalizedErr;
      }
      lastError = normalizedErr;
      reason = describeError(normalizedErr);
      delayMs = computeBackoffDelayMs(attempt, policy);
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener('abort', abortFromExternal);
    }

    params.logger?.warn(
      `${params.providerLabel} transient failure (${reason}); retry ${attempt}/${policy.attempts - 1} in ${delayMs} ms`,
    );
    await sleep(delayMs);
  }

  throw (
    lastError ??
    new Error(`${params.providerLabel} request failed after ${policy.attempts} attempts`)
  );
}

/** Extrae un mensaje legible de cualquier error capturado. */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Espera asincrona simple usada entre reintentos. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
