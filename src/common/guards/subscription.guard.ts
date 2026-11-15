import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { users } from '../../database/drizzle/schema';
import { ALLOW_WITHOUT_SUBSCRIPTION_KEY } from '../decorators/allow-without-subscription.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import { AppHttpException } from '../errors/app-http.exception';
import { ErrorCode } from '../errors/error-codes';
import { isValidSubscriptionTier } from '../../modules/subscriptions/subscriptions.constants';

/**
 * Guardia global de suscripción activa ejecutado inmediatamente después de `JwtAuthGuard`.
 *
 * Exige que todo usuario autenticado haya elegido un plan válido (`dolly`, `dolly_plus` o
 * `dolly_pro`) antes de acceder a cualquier endpoint del sistema que no esté marcado con
 * `@Public()` ni `@AllowWithoutSubscription()`.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  /**
   * Verifica si la ruta es exenta o si el usuario autenticado cuenta con una suscripción activa.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const allowWithoutSubscription = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WITHOUT_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowWithoutSubscription) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new AppHttpException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    const rows = await this.db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const row: { subscriptionTier: string | null } | undefined = rows[0];
    if (!row) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    if (!row.subscriptionTier || !isValidSubscriptionTier(row.subscriptionTier)) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_REQUIRED, {
        message:
          'You must choose a subscription plan (dolly, dolly_plus, or dolly_pro) to access this feature.',
      });
    }

    return true;
  }
}
