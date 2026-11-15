import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../../database/database.tokens';
import type { DrizzleDb } from '../../../database/database.module';
import { promptLogs } from '../../../database/drizzle/schema';
import type { NewPromptLog } from '../../../database/drizzle/types';
import type { AuthEvent } from './auth-event-log.types';

/**
 * Servicio que persiste eventos de autenticación relevantes en la tabla de auditoría `prompt_logs`.
 */
@Injectable()
export class AuthEventLogService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Registra un evento de ciclo de vida de autenticación (registro, ingreso o cierre de sesión). */
  async logAuthEvent(event: AuthEvent, _userId: number): Promise<void> {
    const row: NewPromptLog = {
      level: 'info',
      event,
      message: `auth event: ${event}`,
    };
    await this.db.insert(promptLogs).values(row);
  }
}
