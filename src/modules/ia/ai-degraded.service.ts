import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ErrorLogService } from '../logs';
import { AIProviderFactory } from './providers/ai-provider.factory';
import type {
  AIRequestOptions,
  ChatMessage,
  ProviderName,
} from './providers/ai-provider.interface';

/**
 * Opciones de resiliencia (reintentos y circuit breaker) y enrutamiento opcional de proveedor/modelo
 * para llamadas al servicio de IA.
 */
export interface DegradedCallOptions {
  /** Número máximo de intentos incluyendo el primero. Por defecto 2. */
  retries?: number;
  /** Espera en milisegundos entre reintentos. Por defecto 150. */
  retryDelayMs?: number;
  /**
   * Cantidad de fallos consecutivos en el servicio necesarios para abrir el circuito.
   * Mientras está abierto, el servicio corta de inmediato y devuelve `SERVICE_UNAVAILABLE`
   * en lugar de saturar al proveedor. Por defecto 5.
   */
  circuitFailureThreshold?: number;
  /** Tiempo que el circuito permanece abierto antes de volver a intentar. Por defecto 30s. */
  circuitOpenMs?: number;
  /** Proveedor puntual a usar en esta llamada (`minimax` | `google`). */
  provider?: ProviderName;
  /** Modelo puntual opcional para esta llamada. */
  model?: string;
  /** Opciones adicionales reenviadas al proveedor seleccionado. */
  aiOptions?: AIRequestOptions;
}

/** Valores de resiliencia usados cuando una llamada no especifica opciones propias. */
const DEFAULT_OPTIONS = {
  retries: 2,
  retryDelayMs: 150,
  circuitFailureThreshold: 5,
  circuitOpenMs: 30_000,
} as const;

/**
 * Envoltorio ligero alrededor de `AIProviderFactory` que aplica reintentos y un
 * circuit breaker básico para degradar con elegancia ante caídas del proveedor sin
 * bloquear el ciclo de peticiones. Ante fallos repetidos responde con
 * `SERVICE_UNAVAILABLE` (503) usando el envoltorio estándar.
 *
 * El estado del disyuntor reside en memoria por proceso; en despliegues con múltiples
 * réplicas conviene dimensionar el umbral de forma conservadora o moverlo a caché compartida.
 */
@Injectable()
export class AiDegradedService {
  private readonly logger = new Logger(AiDegradedService.name);
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly factory: AIProviderFactory,
    @Optional() private readonly errorLogs?: ErrorLogService,
  ) {}

  /**
   * Ejecuta la llamada al proveedor aplicando reintentos y protegiendo con el circuit breaker.
   */
  async getFullResponse(messages: ChatMessage[], options?: DegradedCallOptions): Promise<string> {
    const config = {
      retries: options?.retries ?? DEFAULT_OPTIONS.retries,
      retryDelayMs: options?.retryDelayMs ?? DEFAULT_OPTIONS.retryDelayMs,
      circuitFailureThreshold:
        options?.circuitFailureThreshold ?? DEFAULT_OPTIONS.circuitFailureThreshold,
      circuitOpenMs: options?.circuitOpenMs ?? DEFAULT_OPTIONS.circuitOpenMs,
    };

    if (this.circuitIsOpen(config)) {
      void this.errorLogs?.logError({
        severity: 'error',
        source: 'ai_provider',
        module: 'ia',
        errorCode: ErrorCode.SERVICE_UNAVAILABLE,
        httpStatus: 503,
        message: 'AI circuit breaker is open; rejecting request immediately',
        details: { reason: 'ai-circuit-open', provider: options?.provider ?? null },
      });
      throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE);
    }

    const aiOptions = buildAiRequestOptions(options);
    const externalSignal = options?.aiOptions?.signal;

    let lastError: unknown;
    for (let attempt = 1; attempt <= config.retries; attempt += 1) {
      if (externalSignal?.aborted) {
        throw toSignalAbortError(externalSignal);
      }

      try {
        const result =
          aiOptions !== undefined
            ? await this.factory.getFullResponse(messages, aiOptions)
            : await this.factory.getFullResponse(messages);
        this.recordSuccess();
        return result;
      } catch (err) {
        if (externalSignal?.aborted) {
          throw err instanceof Error ? err : toSignalAbortError(externalSignal);
        }

        lastError = err;

        // Cuota agotada: reintentar ahora no sirve (la cuota no se libera en
        // 150 ms) y ademas consume mas cuota del provider. Se responde al
        // instante con un 429 explicito en vez de un 503 generico.
        if (isRateLimited(err)) {
          this.logger.warn(
            `AI provider reached its quota (attempt ${attempt}/${config.retries}): ${describe(err)}`,
          );
          this.recordFailure(config);
          void this.errorLogs?.logError({
            severity: 'warn',
            source: 'ai_provider',
            module: 'ia',
            errorCode: ErrorCode.AI_RATE_LIMITED,
            httpStatus: 429,
            message: describe(err),
            errorName: err instanceof Error ? err.name : typeof err,
            details: {
              reason: 'ai-rate-limited',
              attempt,
              provider: options?.provider ?? null,
              model: options?.model ?? null,
            },
          });
          throw new AppHttpException(ErrorCode.AI_RATE_LIMITED, {
            reason: 'ai-rate-limited',
          });
        }

        this.logger.warn(
          `AI provider call failed (attempt ${attempt}/${config.retries}): ${describe(err)}`,
        );
        if (attempt < config.retries) {
          await sleep(config.retryDelayMs);
        }
      }
    }

    this.recordFailure(config);
    this.logger.error(`AI provider exhausted retries: ${describe(lastError)}`);
    void this.errorLogs?.logError({
      severity: 'error',
      source: 'ai_provider',
      module: 'ia',
      errorCode: ErrorCode.SERVICE_UNAVAILABLE,
      httpStatus: 503,
      message: describe(lastError),
      errorName: lastError instanceof Error ? lastError.name : typeof lastError,
      errorStack: lastError instanceof Error ? (lastError.stack ?? null) : null,
      details: {
        reason: 'ai-call-failed',
        retries: config.retries,
        provider: options?.provider ?? null,
        model: options?.model ?? null,
      },
    });
    throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE);
  }

  /** Indica si el circuito se encuentra abierto actualmente (para diagnóstico o health checks). */
  isDegraded(options?: DegradedCallOptions): boolean {
    const config = {
      circuitFailureThreshold:
        options?.circuitFailureThreshold ?? DEFAULT_OPTIONS.circuitFailureThreshold,
      circuitOpenMs: options?.circuitOpenMs ?? DEFAULT_OPTIONS.circuitOpenMs,
    };
    return this.circuitIsOpen(config);
  }

  /** Mantiene abierto el circuito durante la cuarentena y lo restablece para permitir una prueba. */
  private circuitIsOpen(config: {
    circuitFailureThreshold: number;
    circuitOpenMs: number;
  }): boolean {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt < config.circuitOpenMs) return true;
    // Ventana transcurrida: permitir una petición de prueba para cerrar el circuito si responde bien.
    this.openedAt = null;
    this.consecutiveFailures = 0;
    return false;
  }

  /** Cierra el circuito y reinicia el contador tras una respuesta exitosa del proveedor. */
  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  /** Acumula fallos consecutivos y abre el circuito al alcanzar el umbral configurado. */
  private recordFailure(config: { circuitFailureThreshold: number; circuitOpenMs: number }): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= config.circuitFailureThreshold) {
      this.openedAt = Date.now();
    }
  }
}

/** Combina las opciones de la llamada degradada con proveedor y modelo explícitos si existen. */
function buildAiRequestOptions(options?: DegradedCallOptions): AIRequestOptions | undefined {
  if (!options?.aiOptions && !options?.provider && !options?.model) {
    return undefined;
  }
  return {
    ...options.aiOptions,
    ...(options.provider !== undefined ? { provider: options.provider } : {}),
    ...(options.model !== undefined ? { model: options.model } : {}),
  };
}

/** Extrae un mensaje legible de cualquier error capturado. */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Convierte una señal abortada en `Error` legible sin contaminar el circuit breaker. */
function toSignalAbortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  if (typeof reason === 'string' && reason.trim().length > 0) return new Error(reason);
  return new Error('AI request aborted');
}

/**
 * ¿El fallo es porque el provider se quedo **sin cuota** (429) y no porque
 * este caido?
 *
 * La diferencia importa mucho: un 429 no se arregla reintentando a los 150 ms
 * (la cuota no se libera en ese tiempo), asi que reintentar solo **gasta**
 * mas cuota del provider. Un 5xx, en cambio, si sebeneficia del reintento.
 *
 * El provider no expone el status como tipo, asi que se detecta en el
 * mensaje, que es lo que compone `postOpenAICompatibleChat`
 * (`<provider> request failed: 429 Too Many Requests - <body>`).
 */
export function isRateLimited(err: unknown): boolean {
  const message = describe(err).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('quota exceeded') ||
    message.includes('resource_exhausted')
  );
}

/** Espera asíncrona simple usada entre reintentos. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
