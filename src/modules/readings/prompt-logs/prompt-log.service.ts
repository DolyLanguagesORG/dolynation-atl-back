import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DRIZZLE } from '../../../database/database.tokens';
import type { DrizzleDb } from '../../../database/database.module';
import { promptLogs } from '../../../database/drizzle/schema';
import type { NewPromptLog } from '../../../database/drizzle/types';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { RequestContextService, sanitizeRecordForLog } from '../../logs';
import type { PromptEvent } from './prompt-log.types';

/** Metadatos opcionales de proveedor, modelo y latencia para telemetría de prompts. */
export interface PromptLogExtra {
  provider?: string | null;
  model?: string | null;
  durationMs?: number | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  errorStack?: string | null;
}

/**
 * Servicio de registro y consulta de bitácoras de generación, evaluación y explicaciones con IA.
 */
@Injectable()
export class PromptLogService {
  private readonly logger = new Logger(PromptLogService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  /** Registra un evento exitoso de interacción con la IA junto con su semilla, parámetros y trazas HTTP. */
  async logPromptSuccess(
    event: PromptEvent,
    userId: number,
    textId: number,
    seed: string,
    params: Record<string, unknown>,
    extra?: PromptLogExtra,
  ): Promise<void> {
    const ctx = this.requestContext?.get();
    const requestId = ctx?.requestId ?? null;
    const ipAddress = ctx?.ipAddress ?? null;
    const durationMs =
      extra?.durationMs !== undefined
        ? extra.durationMs
        : (this.requestContext?.getDurationMs() ?? null);
    const provider = extra?.provider ? extra.provider.slice(0, 30) : null;
    const model = extra?.model ? extra.model.slice(0, 60) : null;

    this.logger.log({
      logType: 'prompt',
      level: 'info',
      event,
      userId,
      textId,
      seed,
      requestId,
      ipAddress,
      provider,
      model,
      durationMs,
    });

    const row: NewPromptLog = {
      level: 'info',
      event,
      message: `prompt success: ${event}`,
      userId,
      textId,
      seed,
      requestId,
      ipAddress,
      provider,
      model,
      params: sanitizeRecordForLog(params) ?? params,
      systemPrompt: extra?.systemPrompt ?? null,
      userPrompt: extra?.userPrompt ?? null,
      durationMs,
    };

    try {
      await this.db.insert(promptLogs).values(row);
    } catch (err) {
      this.logger.warn(
        `Failed to persist prompt_logs success (${event}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Registra un fallo ocurrido durante la generación o procesamiento de una petición de IA. */
  async logPromptError(
    event: PromptEvent,
    userId: number | null,
    error: string,
    seed: string,
    extra?: PromptLogExtra,
  ): Promise<void> {
    const ctx = this.requestContext?.get();
    const requestId = ctx?.requestId ?? null;
    const ipAddress = ctx?.ipAddress ?? null;
    const durationMs =
      extra?.durationMs !== undefined
        ? extra.durationMs
        : (this.requestContext?.getDurationMs() ?? null);
    const provider = extra?.provider ? extra.provider.slice(0, 30) : null;
    const model = extra?.model ? extra.model.slice(0, 60) : null;

    this.logger.error({
      logType: 'prompt',
      level: 'error',
      event,
      userId,
      seed,
      requestId,
      ipAddress,
      provider,
      model,
      errorMessage: error,
      durationMs,
    });

    const row: NewPromptLog = {
      level: 'error',
      event,
      message: `prompt error: ${event}: ${error}`,
      userId,
      seed,
      requestId,
      ipAddress,
      provider,
      model,
      errorMessage: error,
      errorStack: extra?.errorStack ?? null,
      systemPrompt: extra?.systemPrompt ?? null,
      userPrompt: extra?.userPrompt ?? null,
      durationMs,
    };

    try {
      await this.db.insert(promptLogs).values(row);
    } catch (err) {
      this.logger.warn(
        `Failed to persist prompt_logs error (${event}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Consulta los intentos fallidos recientes asociados a un usuario. */
  async recentFailedAttempts(
    userId: number,
    limit = 5,
  ): Promise<Array<{ id: number; message: string | null }>> {
    const rows = await this.db
      .select({ id: promptLogs.id, message: promptLogs.message })
      .from(promptLogs)
      .where(
        and(
          eq(promptLogs.userId, userId),
          eq(promptLogs.level, 'error'),
          isNull(promptLogs.errorMessage),
        ),
      )
      .orderBy(desc(promptLogs.createdAt))
      .limit(limit);
    return rows;
  }
}
