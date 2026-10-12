import { Module, Global } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Global cross-cutting concerns:
 *  - AllExceptionsFilter: uniform error envelope
 *  - LoggingInterceptor: log every successful request
 *  - JwtAuthGuard: opt-in auth via @Public() decorator
 */
@Global()
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class CommonModule {}
