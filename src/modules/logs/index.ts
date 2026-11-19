/** Reexportaciones públicas del módulo transversal de auditoría y logs. */
export { LogsModule } from './logs.module';
export { AuditLogService } from './audit-log.service';
export { ErrorLogService } from './error-log.service';
export { RequestContextService, type RequestActorInfo } from './request-context.service';
export {
  RequestContextMiddleware,
  createRequestContextMiddleware,
} from './request-context.middleware';
export {
  AUDIT_ACTIONS,
  ERROR_SEVERITIES,
  ERROR_SOURCES,
  LOG_MODULES,
  type AuditAction,
  type ErrorLogInput,
  type ErrorSeverity,
  type ErrorSource,
  type LogCreateInput,
  type LogDeleteInput,
  type LogEventInput,
  type LogModule,
  type LogSoftDeleteInput,
  type LogUpdateInput,
  type RequestContextStore,
} from './logs.types';
export {
  extractClientIp,
  extractCountryCode,
  extractUserAgent,
  normalizeIpAddress,
} from './utils/ip-extractor.util';
export { sanitizeRecordForLog, sanitizeUnknownForLog } from './utils/log-sanitizer.util';
export { computeStateDiff, type StateDiffResult } from './utils/state-diff.util';
