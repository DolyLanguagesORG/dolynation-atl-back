import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';

/**
 * Registra cada petición HTTP exitosa indicando método, URL y duración en ms.
 * Los fallos ya los registra `AllExceptionsFilter`, por lo que aquí solo se cubre el flujo exitoso.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  /** Mide el tiempo de ejecución del handler y registra la petición al completarse. */
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
