import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';

/**
 * Logs each successful HTTP request with method, URL, status, and duration.
 * Failures are already logged by AllExceptionsFilter, so we only log the happy path here.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.log(`${req.method} ${req.url} ${duration}ms`);
      }),
    );
  }
}
