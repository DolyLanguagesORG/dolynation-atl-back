import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DRIZZLE } from '../../../database/database.tokens';
import type { DrizzleDb } from '../../../database/database.module';
import { promptLogs } from '../../../database/drizzle/schema';
import type { NewPromptLog } from '../../../database/drizzle/types';
import { RequestContextService } from '../../logs';
import type { AuthEvent } from './auth-event-log.types';

/**
 * Servicio que persiste eventos de autenticación relevantes en `prompt_logs`
 * (manteniendo retrocompatibilidad) y los emite al logger Pino.
 */
@Injectable()
export class AuthEventLogService {
  private readonly logger = new Logger(AuthEventLogService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  /** Registra un evento de ciclo de vida de autenticación (registro, ingreso o cierre de sesión). */
  async logAuthEvent(event: AuthEvent, userId: number): Promise<void> {
    const ctx = this.requestContext?.get();
    const requestId = ctx?.requestId ?? null;
    const ipAddress = ctx?.ipAddress ?? null;

    this.logger.log({
      logType: 'auth_prompt_log',
      event,
      userId,
      requestId,
      ipAddress,
    });

    const row: NewPromptLog = {
      level: 'info',
      event,
      message: `auth event: ${event}`,
      userId,
      requestId,
      ipAddress,
    };

    try {
      await this.db.insert(promptLogs).values(row);
    } catch (err) {
      this.logger.warn(
        `Failed to persist auth event in prompt_logs (${event}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
