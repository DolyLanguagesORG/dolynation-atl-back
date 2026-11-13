import { Module, Global } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SubscriptionGuard } from './guards/subscription.guard';

/**
 * Responsabilidades transversales globales:
 *  - AllExceptionsFilter: formato uniforme de errores en el sobre estándar
 *  - LoggingInterceptor: registro de cada petición HTTP exitosa
 *  - JwtAuthGuard: autenticación obligatoria por defecto con exclusión mediante `@Public()`
 *  - SubscriptionGuard: plan de suscripción obligatorio por defecto salvo `@Public()` o `@AllowWithoutSubscription()`
 *
 * La cabecera `X-App-Version` no vive aquí: se registra como middleware en `main.ts`
 * para cubrir también respuestas que no llegan a un controlador (404, 401).
 */
@Global()
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class CommonModule {}
