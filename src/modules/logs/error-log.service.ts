import { HttpException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Request } from 'express';
import type { DrizzleDb } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { errorLogs } from '../../database/drizzle/schema';
import type { NewErrorLog } from '../../database/drizzle/types';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { ErrorLogInput, ErrorSeverity, ErrorSource } from './logs.types';
import { RequestContextService } from './request-context.service';
import { extractClientIp, extractCountryCode, extractUserAgent } from './utils/ip-extractor.util';
import { sanitizeRecordForLog } from './utils/log-sanitizer.util';

type RequestWithUser = Request & { user?: AuthUser };

function inferErrorSource(errorCode: string, exception: unknown): ErrorSource {
  switch (errorCode) {
    case String(ErrorCode.VALIDATION_ERROR):
      return 'validation';
    case String(ErrorCode.AUTH_UNAUTHORIZED):
    case String(ErrorCode.AUTH_TOKEN_INVALID):
    case String(ErrorCode.AUTH_TOKEN_EXPIRED):
    case 'AUTH.MISSING_TOKEN':
    case 'AUTH.INVALID_TOKEN':
      return 'auth_guard';
    case String(ErrorCode.SUBSCRIPTION_REQUIRED):
      return 'subscription_guard';
    case String(ErrorCode.CAPTCHA_REQUIRED):
    case String(ErrorCode.CAPTCHA_VERIFICATION_FAILED):
    case String(ErrorCode.CAPTCHA_PROVIDER_UNAVAILABLE):
    case String(ErrorCode.RATE_LIMIT_EXCEEDED):
      return 'security_guard';
    case String(ErrorCode.AI_RATE_LIMITED):
      return 'ai_provider';
    case String(ErrorCode.INTERNAL_ERROR):
      return exception instanceof HttpException ? 'http_exception' : 'unhandled_exception';
    default:
      return 'http_exception';
  }
}

function inferModuleFromPath(httpPath: string | null | undefined): string | null {
  if (!httpPath) return null;
  const withoutQuery = httpPath.split('?')[0] ?? '';
  const segments = withoutQuery.split('/').filter(Boolean);
  if (segments.length === 0) return 'system';

  // Omite prefijos tipo `/api/v1/...`
  let idx = 0;
  if (segments[0] === 'api') {
    idx = 1;
    if (segments[1] && /^v\d+$/.test(segments[1])) {
      idx = 2;
    }
  }
  const mod = segments[idx];
  if (!mod) return 'system';
  return mod.replace(/-/g, '_').slice(0, 50);
}

function toPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0 ? (value as Record<string, unknown>) : null;
}

/**
 * Servicio centralizado para persistir errores, rechazos 4xx/5xx, excepciones no controladas
 * y fallos de servicios externos (SMTP, IA, moderación) tanto en **Pino** como en **`error_logs`**.
 */
@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(
    @Optional() @Inject(DRIZZLE) private readonly db?: DrizzleDb,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  /**
   * Registra cualquier excepción capturada por `AllExceptionsFilter`, adjuntando IP, actor,
   * ruta, payload sanitizado y stack trace completo en servidor.
   */
  async logHttpException(
    exception: unknown,
    request: Request,
    resolved: {
      status: number;
      body: {
        error: {
          code: string;
          message: string;
          details?: Record<string, unknown>;
        };
      };
    },
  ): Promise<void> {
    const reqWithUser = request as RequestWithUser;
    const rawPath = request.originalUrl || request.url || '/';
    const httpPath = rawPath.slice(0, 500);
    const errorCode = resolved.body.error.code;
    const severity: ErrorSeverity = resolved.status >= 500 ? 'error' : 'warn';
    const source = inferErrorSource(errorCode, exception);
    const moduleName = inferModuleFromPath(httpPath);

    const errorName = exception instanceof Error ? exception.name.slice(0, 120) : typeof exception;
    const rawMessage =
      exception instanceof Error
        ? exception.message
        : typeof exception === 'string'
          ? exception
          : resolved.body.error.message;
    const errorStack = exception instanceof Error ? (exception.stack ?? null) : null;

    const actorUser = reqWithUser.user;
    const country = extractCountryCode(request);
    const details =
      country !== null
        ? { ...(resolved.body.error.details ?? {}), country }
        : (resolved.body.error.details ?? null);

    await this.logError({
      severity,
      source,
      module: moduleName,
      errorCode,
      httpStatus: resolved.status,
      message: rawMessage || resolved.body.error.message,
      errorName,
      errorStack,
      actorUserId: actorUser?.id ?? null,
      actorEmail: actorUser?.email ?? null,
      actorRole: actorUser?.role ?? null,
      ipAddress: extractClientIp(request),
      userAgent: extractUserAgent(request),
      httpMethod: request.method ? request.method.toUpperCase().slice(0, 10) : null,
      httpPath,
      requestBody: toPlainRecord(request.body),
      requestQuery: toPlainRecord(request.query),
      details,
    });
  }

  /**
   * Registra un error de dominio o infraestructura en **Pino** y en **`error_logs`**.
   */
  async logError(input: ErrorLogInput): Promise<void> {
    const ctx = this.requestContext?.get();
    const requestId = input.requestId !== undefined ? input.requestId : (ctx?.requestId ?? null);
    const ipAddress = input.ipAddress !== undefined ? input.ipAddress : (ctx?.ipAddress ?? null);
    const userAgent = input.userAgent !== undefined ? input.userAgent : (ctx?.userAgent ?? null);
    const httpMethod =
      input.httpMethod !== undefined ? input.httpMethod : (ctx?.httpMethod ?? null);
    const httpPath = input.httpPath !== undefined ? input.httpPath : (ctx?.httpPath ?? null);
    const actorUserId =
      input.actorUserId !== undefined ? input.actorUserId : (ctx?.actorUserId ?? null);
    const actorEmail =
      input.actorEmail !== undefined ? input.actorEmail : (ctx?.actorEmail ?? null);
    const actorRole = input.actorRole !== undefined ? input.actorRole : (ctx?.actorRole ?? null);
    const durationMs =
      input.durationMs !== undefined
        ? input.durationMs
        : (this.requestContext?.getDurationMs() ?? null);
    const severity: ErrorSeverity = input.severity ?? 'error';

    const requestBody = sanitizeRecordForLog(input.requestBody);
    const requestQuery = sanitizeRecordForLog(input.requestQuery);
    const rawDetails =
      ctx?.country || input.details
        ? {
            ...(input.details ?? {}),
            ...(ctx?.country ? { country: ctx.country } : {}),
          }
        : null;
    const details = sanitizeRecordForLog(rawDetails);

    const pinoPayload = {
      logType: 'error',
      requestId,
      severity,
      source: input.source,
      module: input.module ?? null,
      errorCode: input.errorCode,
      httpStatus: input.httpStatus ?? null,
      errorName: input.errorName ?? null,
      message: input.message,
      actorUserId,
      actorEmail,
      ipAddress,
      httpMethod,
      httpPath,
      details,
      durationMs,
      ...(severity !== 'warn' && input.errorStack ? { stack: input.errorStack } : {}),
    };

    if (severity === 'warn') {
      this.logger.warn(pinoPayload);
    } else {
      this.logger.error(pinoPayload);
    }

    const row: NewErrorLog = {
      requestId,
      severity,
      source: input.source.slice(0, 40),
      module: input.module ? input.module.slice(0, 50) : null,
      errorCode: input.errorCode.slice(0, 80),
      httpStatus: input.httpStatus ?? null,
      message: input.message,
      errorName: input.errorName ? input.errorName.slice(0, 120) : null,
      errorStack: input.errorStack ?? null,
      actorUserId,
      actorEmail: actorEmail ? actorEmail.slice(0, 254) : null,
      actorRole: actorRole ? actorRole.slice(0, 30) : null,
      ipAddress,
      userAgent,
      httpMethod,
      httpPath,
      requestBody,
      requestQuery,
      details,
      durationMs,
    };

    try {
      if (this.db && typeof this.db.insert === 'function') {
        await this.db.insert(errorLogs).values(row);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to persist error_logs entry (${input.errorCode}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
