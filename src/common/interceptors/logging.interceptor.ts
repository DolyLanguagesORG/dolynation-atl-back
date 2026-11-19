import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import type { AuthUser } from '../decorators/current-user.decorator';
import { extractClientIp, extractUserAgent, RequestContextService } from '../../modules/logs';

type RequestWithUser = Request & { user?: AuthUser };

/**
 * Registra **todas** las peticiones HTTP exitosas (incluidos todos los `GET`) en Pino
 * indicando método, URL, código HTTP, IP, usuario, `requestId` y duración en ms.
 * Los fallos ya los registra `AllExceptionsFilter` en Pino y en `error_logs`.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(@Optional() private readonly requestContext?: RequestContextService) {}

  /** Mide el tiempo de ejecución del handler y emite el registro estructurado a Pino. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithUser>();
    const res = http.getResponse<Response | undefined>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        const statusCode = typeof res?.statusCode === 'number' ? res.statusCode : 200;
        this.requestContext?.setHttpStatus(statusCode);

        const ctx = this.requestContext?.get();
        const requestId = ctx?.requestId ?? null;
        const ipAddress = ctx?.ipAddress ?? extractClientIp(req);
        const userAgent = ctx?.userAgent ?? extractUserAgent(req);
        const userId = req.user?.id ?? ctx?.actorUserId ?? null;
        const url = req.originalUrl || req.url;

        this.logger.log({
          logType: 'http',
          requestId,
          method: req.method,
          url,
          statusCode,
          durationMs,
          userId,
          ipAddress,
          userAgent,
          msg: `${req.method} ${url} ${statusCode} ${durationMs}ms`,
        });
      }),
    );
  }
}
