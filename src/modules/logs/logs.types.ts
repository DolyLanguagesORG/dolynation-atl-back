/** Acciones de auditoría estandarizadas para `audit_logs`. */
export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'SOFT_DELETE',
  'DELETE',
  'AUTH',
  'ACTION',
  'MAIL',
  'MODERATION',
  'AI',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Módulos del sistema trazables en `audit_logs` y `error_logs`. */
export const LOG_MODULES = [
  'auth',
  'users',
  'subscriptions',
  'billing',
  'settings',
  'access_requests',
  'readings',
  'content',
  'evaluation',
  'moderation',
  'admin',
  'ia',
  'mail',
  'security',
  'system',
] as const;

export type LogModule = (typeof LOG_MODULES)[number] | (string & {});

/** Orígenes estandarizados para `error_logs`. */
export const ERROR_SOURCES = [
  'http_exception',
  'validation',
  'auth_guard',
  'subscription_guard',
  'admin_guard',
  'security_guard',
  'unhandled_exception',
  'ai_provider',
  'billing_provider',
  'mail_smtp',
  'moderation',
  'database',
  'system',
] as const;

export type ErrorSource = (typeof ERROR_SOURCES)[number] | (string & {});

/** Niveles de severidad para `error_logs`. */
export const ERROR_SEVERITIES = ['warn', 'error', 'fatal'] as const;

export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

/** Contexto por petición HTTP propagado mediante `AsyncLocalStorage`. */
export interface RequestContextStore {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  country: string | null;
  httpMethod: string | null;
  httpPath: string | null;
  httpStatus?: number;
  startedAt: number;
  actorUserId?: number | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}

/** Datos base compartidos por cualquier entrada en `audit_logs`. */
export interface BaseAuditInput {
  module: LogModule;
  event: string;
  summary: string;
  entityType?: string | null;
  entityId?: string | number | null;
  targetUserId?: number | null;
  actorUserId?: number | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  httpStatus?: number | null;
  metadata?: Record<string, unknown> | null;
  durationMs?: number | null;
}

/** Parámetros para registrar la creación de una entidad (`CREATE`). */
export interface LogCreateInput extends BaseAuditInput {
  afterState: Record<string, unknown>;
}

/** Parámetros para registrar una modificación con comparación antes/después (`UPDATE`). */
export interface LogUpdateInput extends BaseAuditInput {
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
}

/** Parámetros para registrar un borrado lógico (`SOFT_DELETE`). */
export interface LogSoftDeleteInput extends BaseAuditInput {
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
}

/** Parámetros para registrar una eliminación física (`DELETE`). */
export interface LogDeleteInput extends BaseAuditInput {
  beforeState: Record<string, unknown>;
}

/** Parámetros para registrar un evento de negocio/seguridad/sistema sin CRUD estricto. */
export interface LogEventInput extends BaseAuditInput {
  action?: Extract<AuditAction, 'AUTH' | 'ACTION' | 'MAIL' | 'MODERATION' | 'AI'>;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

/** Parámetros para registrar un fallo o excepción en `error_logs` y Pino. */
export interface ErrorLogInput {
  severity?: ErrorSeverity;
  source: ErrorSource;
  module?: LogModule | null;
  errorCode: string;
  httpStatus?: number | null;
  message: string;
  errorName?: string | null;
  errorStack?: string | null;
  actorUserId?: number | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  httpMethod?: string | null;
  httpPath?: string | null;
  requestBody?: Record<string, unknown> | null;
  requestQuery?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  durationMs?: number | null;
  requestId?: string | null;
}
