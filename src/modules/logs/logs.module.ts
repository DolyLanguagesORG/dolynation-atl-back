import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { ErrorLogService } from './error-log.service';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

/**
 * Módulo global transversal de auditoría, trazabilidad y registro de errores.
 *
 * Provee en toda la aplicación:
 *  - `RequestContextService`: correlación por `requestId`, IP, `User-Agent` y actor autenticado.
 *  - `AuditLogService`: auditoría before/after de mutaciones y eventos en Pino + `audit_logs`.
 *  - `ErrorLogService`: persistencia de fallos 4xx/5xx y errores externos en Pino + `error_logs`.
 */
@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware, AuditLogService, ErrorLogService],
  exports: [RequestContextService, RequestContextMiddleware, AuditLogService, ErrorLogService],
})
export class LogsModule {}
