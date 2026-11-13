import { Injectable, Logger } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AIProviderFactory } from './providers/ai-provider.factory';
import type { ChatMessage } from './providers/ai-provider.interface';

/**
 * Opciones de resiliencia (reintentos y circuit breaker) para llamadas al proveedor de IA.
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
}

const DEFAULT_OPTIONS: Required<DegradedCallOptions> = {
  retries: 2,
  retryDelayMs: 150,
  circuitFailureThreshold: 5,
  circuitOpenMs: 30_000,
};

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

  constructor(private readonly factory: AIProviderFactory) {}

  /**
   * Ejecuta la llamada al proveedor aplicando reintentos y protegiendo con el circuit breaker.
   */
  async getFullResponse(messages: ChatMessage[], options?: DegradedCallOptions): Promise<string> {
    const config = { ...DEFAULT_OPTIONS, ...options };

    if (this.circuitIsOpen(config)) {
      throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE, { reason: 'ai-circuit-open' });
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= config.retries; attempt += 1) {
      try {
        const result = await this.factory.getFullResponse(messages);
        this.recordSuccess();
        return result;
      } catch (err) {
        lastError = err;
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
    throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE, { reason: 'ai-call-failed' });
  }

  /** Indica si el circuito se encuentra abierto actualmente (para diagnóstico o health checks). */
  isDegraded(options?: DegradedCallOptions): boolean {
    const config = { ...DEFAULT_OPTIONS, ...options };
    return this.circuitIsOpen(config);
  }

  private circuitIsOpen(config: Required<DegradedCallOptions>): boolean {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt < config.circuitOpenMs) return true;
    // Ventana transcurrida: permitir una petición de prueba para cerrar el circuito si responde bien.
    this.openedAt = null;
    this.consecutiveFailures = 0;
    return false;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  private recordFailure(config: Required<DegradedCallOptions>): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= config.circuitFailureThreshold) {
      this.openedAt = Date.now();
    }
  }
}

/** Extrae un mensaje legible de cualquier error capturado. */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Espera asíncrona simple usada entre reintentos. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
