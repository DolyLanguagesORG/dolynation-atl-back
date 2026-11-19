import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DEFAULT_UI_LOCALE } from '../../common/types/locale';
import { DEFAULT_USER_ROLE, isUserRole } from '../../common/types/user-role';
import type { DrizzleDb } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  accessRequests,
  auditLogs,
  errorLogs,
  promptLogs,
  roles,
  users,
  userSettings,
} from '../../database/drizzle/schema';
import { describeError } from '../mail/mail.errors';
import { MailService } from '../mail/mail.service';
import { isMailLocale, type MailLocale } from '../mail/mail.types';
import { AuditLogService, ErrorLogService } from '../logs';
import {
  isValidSubscriptionTier,
  SUBSCRIPTION_PLANS,
} from '../subscriptions/subscriptions.constants';
import type {
  AdminCategoryDto,
  AdminPromptLogDto,
  AdminUserRowDto,
  AdminUsersQueryDto,
} from './dto/admin-category.dto';
import type {
  AdminAccessRequestDto,
  AdminRequestsQueryDto,
  AdminUserDetailDto,
  ReviewAccessRequestResponseDto,
} from './dto/admin-requests.dto';
import type {
  AdminAuditLogItemDto,
  AdminAuditLogListResponseDto,
  AdminAuditLogsQueryDto,
  AdminErrorLogItemDto,
  AdminErrorLogListResponseDto,
  AdminErrorLogsQueryDto,
  AdminRequestTraceDto,
} from './dto/admin-logs.dto';

/** Cantidad máxima de usuarios devueltos por consulta en el panel de administración. */
const USERS_PAGE_SIZE = 100;

/** Cantidad máxima de solicitudes devueltas por consulta en el panel de administración. */
const REQUESTS_PAGE_SIZE = 100;

/** Cantidad máxima de fallos de la IA devueltos por consulta. */
const PROMPT_LOGS_PAGE_SIZE = 50;

/** Tamaño de página predeterminado y máximo para consultas de logs de auditoría y errores. */
const LOGS_DEFAULT_PAGE_SIZE = 50;
const LOGS_MAX_PAGE_SIZE = 200;

function parseDateBound(raw: string | undefined, endOfDayIfDateOnly: boolean): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (endOfDayIfDateOnly && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T23:59:59.999Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampLogsLimit(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return LOGS_DEFAULT_PAGE_SIZE;
  }
  return Math.max(1, Math.min(LOGS_MAX_PAGE_SIZE, Math.floor(raw)));
}

function clampLogsOffset(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
}

function resolveMailLocale(locale: string | null | undefined): MailLocale {
  return isMailLocale(locale) ? locale : DEFAULT_UI_LOCALE;
}

function resolvePlanDisplayName(tier: string | null | undefined): string | null {
  if (!tier) return null;
  return isValidSubscriptionTier(tier) ? SUBSCRIPTION_PLANS[tier].name : tier;
}

/**
 * Servicio con las operaciones de consulta, supervisión y aprobación para administradores.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Optional() private readonly mail?: MailService,
    @Optional() private readonly auditLogs?: AuditLogService,
    @Optional() private readonly errorLogs?: ErrorLogService,
  ) {}

  /**
   * Sin categorías predefinidas en el sistema: las categorías son dinámicas y definidas por cada usuario.
   */
  listCategories(): AdminCategoryDto[] {
    return [];
  }

  /**
   * Lista los **fallos del proveedor de IA** registrados en `prompt_logs`.
   */
  async listPromptLogs(
    limit = PROMPT_LOGS_PAGE_SIZE,
    onlyErrors = true,
  ): Promise<AdminPromptLogDto[]> {
    return this.db
      .select({
        id: promptLogs.id,
        level: promptLogs.level,
        event: promptLogs.event,
        errorMessage: promptLogs.errorMessage,
        message: promptLogs.message,
        userId: promptLogs.userId,
        requestId: promptLogs.requestId,
        ipAddress: promptLogs.ipAddress,
        provider: promptLogs.provider,
        model: promptLogs.model,
        durationMs: promptLogs.durationMs,
        createdAt: promptLogs.createdAt,
      })
      .from(promptLogs)
      .where(onlyErrors ? eq(promptLogs.level, 'error') : undefined)
      .orderBy(desc(promptLogs.createdAt))
      .limit(limit);
  }

  /**
   * Lista paginada y filtrable de registros de auditoría (`audit_logs`) para investigación y trazabilidad.
   */
  async listAuditLogs(query: AdminAuditLogsQueryDto = {}): Promise<AdminAuditLogListResponseDto> {
    const limit = clampLogsLimit(query.limit);
    const offset = clampLogsOffset(query.offset);
    const conditions: SQL[] = [];

    if (query.actorUserId !== undefined) {
      conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
    }
    if (query.targetUserId !== undefined) {
      conditions.push(eq(auditLogs.targetUserId, query.targetUserId));
    }
    if (query.module?.trim()) {
      conditions.push(eq(auditLogs.module, query.module.trim()));
    }
    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action));
    }
    if (query.event?.trim()) {
      conditions.push(eq(auditLogs.event, query.event.trim()));
    }
    if (query.entityType?.trim()) {
      conditions.push(eq(auditLogs.entityType, query.entityType.trim()));
    }
    if (query.entityId?.trim()) {
      conditions.push(eq(auditLogs.entityId, query.entityId.trim()));
    }
    if (query.ipAddress?.trim()) {
      conditions.push(eq(auditLogs.ipAddress, query.ipAddress.trim()));
    }
    if (query.requestId?.trim()) {
      conditions.push(eq(auditLogs.requestId, query.requestId.trim()));
    }

    const fromDate = parseDateBound(query.from, false);
    if (fromDate) {
      conditions.push(gte(auditLogs.createdAt, fromDate));
    }
    const toDate = parseDateBound(query.to, true);
    if (toDate) {
      conditions.push(lte(auditLogs.createdAt, toDate));
    }

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const searchExpr = or(
        ilike(auditLogs.summary, pattern),
        ilike(auditLogs.actorEmail, pattern),
        ilike(auditLogs.event, pattern),
        ilike(auditLogs.entityId, pattern),
        ilike(auditLogs.httpPath, pattern),
      );
      if (searchExpr) {
        conditions.push(searchExpr);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(whereClause),
    ]);

    return {
      items,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    };
  }

  /**
   * Devuelve el detalle completo de un registro de auditoría (`beforeState`, `afterState`, `changedFields`).
   */
  async getAuditLogById(id: number): Promise<AdminAuditLogItemDto> {
    const rows = await this.db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'AuditLog' });
    }
    return row;
  }

  /**
   * Lista paginada y filtrable de errores (`error_logs`) para diagnóstico rápido de fallos 4xx/5xx/IA/SMTP.
   */
  async listErrorLogs(query: AdminErrorLogsQueryDto = {}): Promise<AdminErrorLogListResponseDto> {
    const limit = clampLogsLimit(query.limit);
    const offset = clampLogsOffset(query.offset);
    const conditions: SQL[] = [];

    if (query.actorUserId !== undefined) {
      conditions.push(eq(errorLogs.actorUserId, query.actorUserId));
    }
    if (query.severity) {
      conditions.push(eq(errorLogs.severity, query.severity));
    }
    if (query.source?.trim()) {
      conditions.push(eq(errorLogs.source, query.source.trim()));
    }
    if (query.module?.trim()) {
      conditions.push(eq(errorLogs.module, query.module.trim()));
    }
    if (query.errorCode?.trim()) {
      conditions.push(eq(errorLogs.errorCode, query.errorCode.trim()));
    }
    if (query.httpStatus !== undefined) {
      conditions.push(eq(errorLogs.httpStatus, query.httpStatus));
    }
    if (query.ipAddress?.trim()) {
      conditions.push(eq(errorLogs.ipAddress, query.ipAddress.trim()));
    }
    if (query.requestId?.trim()) {
      conditions.push(eq(errorLogs.requestId, query.requestId.trim()));
    }

    const fromDate = parseDateBound(query.from, false);
    if (fromDate) {
      conditions.push(gte(errorLogs.createdAt, fromDate));
    }
    const toDate = parseDateBound(query.to, true);
    if (toDate) {
      conditions.push(lte(errorLogs.createdAt, toDate));
    }

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const searchExpr = or(
        ilike(errorLogs.message, pattern),
        ilike(errorLogs.errorCode, pattern),
        ilike(errorLogs.httpPath, pattern),
        ilike(errorLogs.actorEmail, pattern),
      );
      if (searchExpr) {
        conditions.push(searchExpr);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(errorLogs)
        .where(whereClause)
        .orderBy(desc(errorLogs.createdAt), desc(errorLogs.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(errorLogs)
        .where(whereClause),
    ]);

    return {
      items,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    };
  }

  /**
   * Devuelve el detalle completo de un error registrado incluyendo `errorStack` y payloads sanitizados.
   */
  async getErrorLogById(id: number): Promise<AdminErrorLogItemDto> {
    const rows = await this.db.select().from(errorLogs).where(eq(errorLogs.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'ErrorLog' });
    }
    return row;
  }

  /**
   * Modo Detective: reconstruye en orden cronológico toda la actividad de una petición (`requestId`)
   * correlacionando `audit_logs`, `error_logs` y `prompt_logs`.
   */
  async getRequestTrace(requestId: string): Promise<AdminRequestTraceDto> {
    const cleanRequestId = requestId.trim();
    if (!cleanRequestId) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        fields: [{ field: 'requestId', message: 'requestId must not be empty' }],
      });
    }

    const [audits, errors, prompts] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.requestId, cleanRequestId))
        .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id)),
      this.db
        .select()
        .from(errorLogs)
        .where(eq(errorLogs.requestId, cleanRequestId))
        .orderBy(asc(errorLogs.createdAt), asc(errorLogs.id)),
      this.db
        .select({
          id: promptLogs.id,
          level: promptLogs.level,
          event: promptLogs.event,
          errorMessage: promptLogs.errorMessage,
          message: promptLogs.message,
          userId: promptLogs.userId,
          requestId: promptLogs.requestId,
          ipAddress: promptLogs.ipAddress,
          provider: promptLogs.provider,
          model: promptLogs.model,
          durationMs: promptLogs.durationMs,
          createdAt: promptLogs.createdAt,
        })
        .from(promptLogs)
        .where(eq(promptLogs.requestId, cleanRequestId))
        .orderBy(asc(promptLogs.createdAt), asc(promptLogs.id)),
    ]);

    return {
      requestId: cleanRequestId,
      auditLogs: audits,
      errorLogs: errors,
      promptLogs: prompts,
    };
  }

  /**
   * Lista los usuarios activos con su rol, estado de verificación, plan actual y
   * conteo de solicitudes pendientes.
   */
  async listUsers(
    query: AdminUsersQueryDto = {},
    limit = USERS_PAGE_SIZE,
  ): Promise<AdminUserRowDto[]> {
    const conditions: SQL[] = [isNull(users.deletedAt)];

    if (query.role) {
      conditions.push(eq(roles.name, query.role));
    }

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const searchExpr = or(ilike(users.email, pattern), ilike(users.fullName, pattern));
      if (searchExpr) {
        conditions.push(searchExpr);
      }
    }

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roleName: roles.name,
        subscriptionTier: users.subscriptionTier,
        emailVerifiedAt: users.emailVerifiedAt,
        locale: users.locale,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit);

    if (rows.length === 0) {
      return [];
    }

    const userIds = rows.map((row) => row.id);
    const pendingCountsRows = await this.db
      .select({
        userId: accessRequests.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(accessRequests)
      .where(and(inArray(accessRequests.userId, userIds), eq(accessRequests.status, 'pending')))
      .groupBy(accessRequests.userId);

    const pendingCountMap = new Map<number, number>();
    for (const item of pendingCountsRows) {
      pendingCountMap.set(item.userId, item.count);
    }

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: isUserRole(row.roleName) ? row.roleName : DEFAULT_USER_ROLE,
      subscriptionTier: row.subscriptionTier ?? null,
      emailVerifiedAt: row.emailVerifiedAt ?? null,
      locale: row.locale,
      pendingRequestsCount: pendingCountMap.get(row.id) ?? 0,
      createdAt: row.createdAt,
    }));
  }

  private async selectEnrichedRequests(
    conditions: SQL[],
    limit = REQUESTS_PAGE_SIZE,
  ): Promise<AdminAccessRequestDto[]> {
    return this.db
      .select({
        id: accessRequests.id,
        userId: accessRequests.userId,
        userEmail: users.email,
        userFullName: users.fullName,
        userLocale: users.locale,
        userEmailVerifiedAt: users.emailVerifiedAt,
        userCurrentTier: users.subscriptionTier,
        requestType: accessRequests.requestType,
        requestedTier: accessRequests.requestedTier,
        currentTier: accessRequests.currentTier,
        userMessage: accessRequests.userMessage,
        status: accessRequests.status,
        rejectionReason: accessRequests.rejectionReason,
        reviewedByUserId: accessRequests.reviewedByUserId,
        reviewedAt: accessRequests.reviewedAt,
        createdAt: accessRequests.createdAt,
        updatedAt: accessRequests.updatedAt,
      })
      .from(accessRequests)
      .innerJoin(users, eq(accessRequests.userId, users.id))
      .where(and(...conditions))
      .orderBy(
        sql`CASE WHEN ${accessRequests.status} = 'pending' THEN 0 ELSE 1 END`,
        desc(accessRequests.createdAt),
        desc(accessRequests.id),
      )
      .limit(limit);
  }

  /**
   * Devuelve el detalle administrativo de un usuario específico junto con sus solicitudes.
   */
  async getUserDetail(userId: number): Promise<AdminUserDetailDto> {
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roleName: roles.name,
        subscriptionTier: users.subscriptionTier,
        emailVerifiedAt: users.emailVerifiedAt,
        locale: users.locale,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!row) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    const userRequests = await this.selectEnrichedRequests([
      isNull(users.deletedAt),
      eq(accessRequests.userId, userId),
    ]);

    return {
      user: {
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        role: isUserRole(row.roleName) ? row.roleName : DEFAULT_USER_ROLE,
        subscriptionTier: row.subscriptionTier ?? null,
        emailVerifiedAt: row.emailVerifiedAt ?? null,
        locale: row.locale,
        pendingRequestsCount: userRequests.filter((item) => item.status === 'pending').length,
        createdAt: row.createdAt,
      },
      requests: userRequests,
    };
  }

  /**
   * Lista las solicitudes de acceso (planes y desbloqueos de idioma) priorizando las pendientes.
   */
  async listRequests(
    query: AdminRequestsQueryDto = {},
    limit = REQUESTS_PAGE_SIZE,
  ): Promise<AdminAccessRequestDto[]> {
    const conditions: SQL[] = [isNull(users.deletedAt)];

    if (query.status) {
      conditions.push(eq(accessRequests.status, query.status));
    }
    if (query.type) {
      conditions.push(eq(accessRequests.requestType, query.type));
    }
    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const searchExpr = or(ilike(users.email, pattern), ilike(users.fullName, pattern));
      if (searchExpr) {
        conditions.push(searchExpr);
      }
    }

    return this.selectEnrichedRequests(conditions, limit);
  }

  /**
   * Aprueba una solicitud pendiente de forma atómica, otorga el plan o crédito de idioma
   * y envía el correo de bienvenida/confirmación al usuario.
   */
  async approveRequest(
    adminUserId: number,
    requestId: number,
  ): Promise<ReviewAccessRequestResponseDto> {
    const now = new Date();

    const updated = await this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(accessRequests)
        .set({
          status: 'approved',
          rejectionReason: null,
          reviewedByUserId: adminUserId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, 'pending')))
        .returning();

      if (!claimed) {
        return null;
      }

      if (claimed.requestType === 'subscription') {
        if (!isValidSubscriptionTier(claimed.requestedTier)) {
          throw new AppHttpException(ErrorCode.SUBSCRIPTION_INVALID_TIER, {
            tier: claimed.requestedTier,
          });
        }
        await tx
          .update(users)
          .set({ subscriptionTier: claimed.requestedTier, updatedAt: now })
          .where(eq(users.id, claimed.userId));
      } else {
        await tx
          .insert(userSettings)
          .values({
            userId: claimed.userId,
            preferredCategories: [],
            selectedLanguages: [],
            languageChangeCredits: 1,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: {
              languageChangeCredits: sql`GREATEST(0, ${userSettings.languageChangeCredits}) + 1`,
              updatedAt: now,
            },
          });
      }

      return claimed;
    });

    if (!updated) {
      await this.throwNotFoundOrAlreadyReviewed(requestId);
    }

    const enriched = await this.findEnrichedRequestById(requestId);
    let emailSent = false;
    if (this.mail) {
      try {
        await this.mail.sendAccessRequestApproved({
          to: enriched.userEmail,
          fullName: enriched.userFullName,
          requestType: enriched.requestType,
          planName: resolvePlanDisplayName(enriched.requestedTier),
          locale: resolveMailLocale(enriched.userLocale),
        });
        emailSent = true;
      } catch (error) {
        const errDesc = describeError(error);
        this.logger.error(
          `No se pudo enviar correo de aprobación para solicitud #${requestId}: ${errDesc}`,
        );
        await this.errorLogs?.logError({
          severity: 'error',
          source: 'mail_smtp',
          module: 'admin',
          errorCode: 'MAIL_DELIVERY_ERROR',
          message: `Failed to send approval email for request #${requestId}: ${errDesc}`,
          errorName: error instanceof Error ? error.name : typeof error,
          errorStack: error instanceof Error ? (error.stack ?? null) : null,
          actorUserId: adminUserId,
        });
      }
    }

    await this.auditLogs?.logUpdate({
      module: 'admin',
      event: 'admin.access_request_approved',
      entityType: 'access_requests',
      entityId: requestId,
      actorUserId: adminUserId,
      targetUserId: enriched.userId,
      summary: `Admin #${adminUserId} approved ${enriched.requestType} access request #${requestId} for user #${enriched.userId}`,
      beforeState: {
        id: requestId,
        status: 'pending',
        rejectionReason: null,
        reviewedByUserId: null,
        reviewedAt: null,
        requestType: enriched.requestType,
        currentTier: enriched.currentTier,
      },
      afterState: {
        id: requestId,
        status: 'approved',
        rejectionReason: null,
        reviewedByUserId: adminUserId,
        reviewedAt: now,
        requestType: enriched.requestType,
        requestedTier: enriched.requestedTier,
        userCurrentTier: enriched.userCurrentTier,
      },
      metadata: { emailSent },
    });

    return { request: enriched, emailSent };
  }

  /**
   * Rechaza una solicitud pendiente guardando el motivo obligatorio y enviándolo al usuario por correo.
   */
  async rejectRequest(
    adminUserId: number,
    requestId: number,
    reason: string,
  ): Promise<ReviewAccessRequestResponseDto> {
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        fields: [
          {
            field: 'reason',
            message: 'Rejection reason must be at least 5 characters long.',
          },
        ],
      });
    }

    const now = new Date();
    const [updated] = await this.db
      .update(accessRequests)
      .set({
        status: 'rejected',
        rejectionReason: cleanReason,
        reviewedByUserId: adminUserId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, 'pending')))
      .returning();

    if (!updated) {
      await this.throwNotFoundOrAlreadyReviewed(requestId);
    }

    const enriched = await this.findEnrichedRequestById(requestId);
    let emailSent = false;
    if (this.mail) {
      try {
        await this.mail.sendAccessRequestRejected({
          to: enriched.userEmail,
          fullName: enriched.userFullName,
          requestType: enriched.requestType,
          planName: resolvePlanDisplayName(enriched.requestedTier),
          reason: cleanReason,
          locale: resolveMailLocale(enriched.userLocale),
        });
        emailSent = true;
      } catch (error) {
        const errDesc = describeError(error);
        this.logger.error(
          `No se pudo enviar correo de rechazo para solicitud #${requestId}: ${errDesc}`,
        );
        await this.errorLogs?.logError({
          severity: 'error',
          source: 'mail_smtp',
          module: 'admin',
          errorCode: 'MAIL_DELIVERY_ERROR',
          message: `Failed to send rejection email for request #${requestId}: ${errDesc}`,
          errorName: error instanceof Error ? error.name : typeof error,
          errorStack: error instanceof Error ? (error.stack ?? null) : null,
          actorUserId: adminUserId,
        });
      }
    }

    await this.auditLogs?.logUpdate({
      module: 'admin',
      event: 'admin.access_request_rejected',
      entityType: 'access_requests',
      entityId: requestId,
      actorUserId: adminUserId,
      targetUserId: enriched.userId,
      summary: `Admin #${adminUserId} rejected ${enriched.requestType} access request #${requestId} for user #${enriched.userId}`,
      beforeState: {
        id: requestId,
        status: 'pending',
        rejectionReason: null,
        reviewedByUserId: null,
        reviewedAt: null,
      },
      afterState: {
        id: requestId,
        status: 'rejected',
        rejectionReason: cleanReason,
        reviewedByUserId: adminUserId,
        reviewedAt: now,
      },
      metadata: { emailSent },
    });

    return { request: enriched, emailSent };
  }

  private async throwNotFoundOrAlreadyReviewed(requestId: number): Promise<never> {
    const rows = await this.db
      .select({ id: accessRequests.id, status: accessRequests.status })
      .from(accessRequests)
      .where(eq(accessRequests.id, requestId))
      .limit(1);

    if (rows[0]) {
      throw new AppHttpException(ErrorCode.ACCESS_REQUEST_ALREADY_REVIEWED, {
        status: rows[0].status,
      });
    }
    throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'AccessRequest' });
  }

  private async findEnrichedRequestById(requestId: number): Promise<AdminAccessRequestDto> {
    const rows = await this.db
      .select({
        id: accessRequests.id,
        userId: accessRequests.userId,
        userEmail: users.email,
        userFullName: users.fullName,
        userLocale: users.locale,
        userEmailVerifiedAt: users.emailVerifiedAt,
        userCurrentTier: users.subscriptionTier,
        requestType: accessRequests.requestType,
        requestedTier: accessRequests.requestedTier,
        currentTier: accessRequests.currentTier,
        userMessage: accessRequests.userMessage,
        status: accessRequests.status,
        rejectionReason: accessRequests.rejectionReason,
        reviewedByUserId: accessRequests.reviewedByUserId,
        reviewedAt: accessRequests.reviewedAt,
        createdAt: accessRequests.createdAt,
        updatedAt: accessRequests.updatedAt,
      })
      .from(accessRequests)
      .innerJoin(users, eq(accessRequests.userId, users.id))
      .where(eq(accessRequests.id, requestId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'AccessRequest' });
    }
    return row;
  }
}
