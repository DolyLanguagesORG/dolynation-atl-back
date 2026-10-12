import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../../database/database.tokens';
import type { DrizzleDb } from '../../../database/database.module';
import { promptLogs } from '../../../database/drizzle/schema';
import type { NewPromptLog } from '../../../database/drizzle/types';
import type { AuthEvent } from './auth-event-log.types';

@Injectable()
export class AuthEventLogService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async logAuthEvent(event: AuthEvent, _userId: number): Promise<void> {
    const row: NewPromptLog = {
      level: 'info',
      event,
      message: `auth event: ${event}`,
    };
    await this.db.insert(promptLogs).values(row);
  }
}
