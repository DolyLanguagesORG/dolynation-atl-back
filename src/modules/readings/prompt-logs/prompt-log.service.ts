import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../../database/database.tokens';
import type { DrizzleDb } from '../../../database/database.module';
import { promptLogs } from '../../../database/drizzle/schema';
import type { NewPromptLog } from '../../../database/drizzle/types';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PromptEvent } from './prompt-log.types';

@Injectable()
export class PromptLogService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

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
