import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../../database/database.tokens';
import type { DrizzleDb } from '../../../database/database.module';
import { promptLogs } from '../../../database/drizzle/schema';
import type { NewPromptLog } from '../../../database/drizzle/types';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PromptEvent } from './prompt-log.types';

/**
 * Servicio de registro y consulta de bitácoras de generación, evaluación y explicaciones con IA.
 */
@Injectable()
export class PromptLogService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Registra un evento exitoso de interacción con la IA junto con su semilla y parámetros. */
  async logPromptSuccess(
    event: PromptEvent,
    userId: number,
    textId: number,
    seed: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const row: NewPromptLog = {
      level: 'info',
      event,
      message: `prompt success: ${event}`,
      userId,
      textId,
      seed,
      params,
    };
    await this.db.insert(promptLogs).values(row);
  }

  /** Registra un fallo ocurrido durante la generación o procesamiento de una petición de IA. */
  async logPromptError(
    event: PromptEvent,
    userId: number | null,
    error: string,
    seed: string,
  ): Promise<void> {
    const row: NewPromptLog = {
      level: 'error',
      event,
      message: `prompt error: ${event}: ${error}`,
      userId,
      seed,
      errorMessage: error,
    };
    await this.db.insert(promptLogs).values(row);
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
