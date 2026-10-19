import { Injectable, Logger } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AIProviderFactory } from './providers/ai-provider.factory';
import type { ChatMessage } from './providers/ai-provider.interface';

export interface DegradedCallOptions {
  /** Max attempts including the first one. Defaults to 2. */
  retries?: number;
  /** Delay in ms between retries. Defaults to 150. */
  retryDelayMs?: number;
  /**
   * How many consecutive failures across the service trip the circuit.
   * While tripped, the service short-circuits and surfaces SERVICE_UNAVAILABLE
   * instead of hammering the provider. Defaults to 5.
   */
  circuitFailureThreshold?: number;
  /** How long the circuit stays open before trying again. Defaults to 30s. */
  circuitOpenMs?: number;
}

const DEFAULT_OPTIONS: Required<DegradedCallOptions> = {
  retries: 2,
  retryDelayMs: 150,
  circuitFailureThreshold: 5,
  circuitOpenMs: 30_000,
};

/**
 * Thin wrapper around the AI provider factory that applies retries plus a
 * minimal circuit breaker, so a provider outage degrades gracefully instead
 * of hanging the request path. On repeated failure the service surfaces
 * \`SERVICE_UNAVAILABLE\` (503) via the standard envelope.
 *
 * The breaker is kept in-memory per-process; for a multi-pod deployment the
 * threshold should be sized conservatively or lifted into a shared cache.
 */
@Injectable()
export class AiDegradedService {
  private readonly logger = new Logger(AiDegradedService.name);
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(private readonly factory: AIProviderFactory) {}

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

  /** For diagnostics / health checks. */
  isDegraded(options?: DegradedCallOptions): boolean {
    const config = { ...DEFAULT_OPTIONS, ...options };
    return this.circuitIsOpen(config);
  }

  private circuitIsOpen(config: Required<DegradedCallOptions>): boolean {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt < config.circuitOpenMs) return true;
    // Window elapsed — allow a probe.
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

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
