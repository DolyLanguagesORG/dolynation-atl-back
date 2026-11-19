import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { DrizzleDb } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { auditLogs } from '../../database/drizzle/schema';
import type { NewAuditLog } from '../../database/drizzle/types';
import type {
  AuditAction,
  BaseAuditInput,
  LogCreateInput,
  LogDeleteInput,
  LogEventInput,
  LogSoftDeleteInput,
  LogUpdateInput,
} from './logs.types';
import { RequestContextService } from './request-context.service';
import { sanitizeRecordForLog } from './utils/log-sanitizer.util';
import { computeStateDiff } from './utils/state-diff.util';

/**
 * Servicio central de auditoría de operaciones y trazabilidad ("Modo Detective").
 *
 * Emite **siempre** cada registro por partida doble:
 *   1. Hacia **Pino** (consola estructurada / stdout de Docker).
 *   2. Hacia **PostgreSQL (`audit_logs`)** de forma *fail-open* para no interrumpir
 *      operaciones de negocio si ocurre una anomalía puntual en la escritura de logs.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @Optional() @Inject(DRIZZLE) private readonly db?: DrizzleDb,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  /** Registra la creación de una entidad (`CREATE`) con su snapshot `afterState`. */
  async logCreate(input: LogCreateInput): Promise<void> {
    await this.record({
      ...input,
      action: 'CREATE',
      beforeState: null,
      afterState: sanitizeRecordForLog(input.afterState),
      changedFields: [],
    });
  }

  /** Registra la actualización de una entidad (`UPDATE`) calculando `beforeState`, `afterState` y `changedFields`. */
  async logUpdate(input: LogUpdateInput): Promise<void> {
    const diff = computeStateDiff(input.beforeState, input.afterState);
    await this.record({
      ...input,
      action: 'UPDATE',
      beforeState: diff.beforeState,
      afterState: diff.afterState,
      changedFields: diff.changedFields,
    });
  }

  /** Registra un borrado lógico (`SOFT_DELETE`) conservando el registro previo y la marca `deletedAt`. */
  async logSoftDelete(input: LogSoftDeleteInput): Promise<void> {
    const diff = computeStateDiff(input.beforeState, input.afterState);
    await this.record({
      ...input,
      action: 'SOFT_DELETE',
      beforeState: diff.beforeState,
      afterState: diff.afterState,
      changedFields: diff.changedFields,
    });
  }

  /** Registra una eliminación física (`DELETE`) preservando la imagen `beforeState` antes de desaparecer. */
  async logDelete(input: LogDeleteInput): Promise<void> {
    await this.record({
      ...input,
      action: 'DELETE',
      beforeState: sanitizeRecordForLog(input.beforeState),
      afterState: null,
      changedFields: [],
    });
  }

  /** Registra un evento de negocio, autenticación, correo, moderación o IA. */
  async logEvent(input: LogEventInput): Promise<void> {
    const action: AuditAction = input.action ?? 'ACTION';
    const hasBothStates = Boolean(input.beforeState && input.afterState);
    const diff = hasBothStates
      ? computeStateDiff(input.beforeState, input.afterState)
      : {
          beforeState: sanitizeRecordForLog(input.beforeState),
          afterState: sanitizeRecordForLog(input.afterState),
          changedFields: [] as string[],
        };

    await this.record({
      ...input,
      action,
      beforeState: diff.beforeState,
      afterState: diff.afterState,
      changedFields: diff.changedFields,
    });
  }

  private async record(
    params: BaseAuditInput & {
      action: AuditAction;
      beforeState: Record<string, unknown> | null;
      afterState: Record<string, unknown> | null;
      changedFields: string[];
    },
  ): Promise<void> {
    const ctx = this.requestContext?.get();
    const requestId = ctx?.requestId ?? null;
    const ipAddress = ctx?.ipAddress ?? null;
    const userAgent = ctx?.userAgent ?? null;
    const httpMethod = ctx?.httpMethod ?? null;
    const httpPath = ctx?.httpPath ?? null;
    const httpStatus = params.httpStatus ?? ctx?.httpStatus ?? null;
    const actorUserId =
      params.actorUserId !== undefined ? params.actorUserId : (ctx?.actorUserId ?? null);
    const actorEmail =
      params.actorEmail !== undefined ? params.actorEmail : (ctx?.actorEmail ?? null);
    const actorRole = params.actorRole !== undefined ? params.actorRole : (ctx?.actorRole ?? null);
    const durationMs =
      params.durationMs !== undefined
        ? params.durationMs
        : (this.requestContext?.getDurationMs() ?? null);
    const entityId =
      params.entityId !== undefined && params.entityId !== null
        ? String(params.entityId).slice(0, 120)
        : null;

    const rawMetadata =
      ctx?.country || params.metadata
        ? {
            ...(params.metadata ?? {}),
            ...(ctx?.country ? { country: ctx.country } : {}),
          }
        : null;
    const metadata = sanitizeRecordForLog(rawMetadata);

    this.logger.log({
      logType: 'audit',
      requestId,
      module: params.module,
      action: params.action,
      event: params.event,
      entityType: params.entityType ?? null,
      entityId,
      actorUserId,
      actorEmail,
      actorRole,
      targetUserId: params.targetUserId ?? null,
      ipAddress,
      httpMethod,
      httpPath,
      httpStatus,
      changedFields: params.changedFields,
      summary: params.summary,
      durationMs,
    });

    const row: NewAuditLog = {
      requestId,
      actorUserId,
      actorEmail: actorEmail ? actorEmail.slice(0, 254) : null,
      actorRole: actorRole ? actorRole.slice(0, 30) : null,
      targetUserId: params.targetUserId ?? null,
      ipAddress,
      userAgent,
      httpMethod,
      httpPath,
      httpStatus,
      module: params.module.slice(0, 50),
      action: params.action,
      event: params.event.slice(0, 100),
      entityType: params.entityType ? params.entityType.slice(0, 60) : null,
      entityId,
      summary: params.summary,
      beforeState: params.beforeState,
      afterState: params.afterState,
      changedFields: params.changedFields,
      metadata,
      durationMs,
    };

    try {
      if (this.db && typeof this.db.insert === 'function') {
        await this.db.insert(auditLogs).values(row);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to persist audit_logs entry (${params.event}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
