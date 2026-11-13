import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_SUBSCRIPTION_KEY = 'allowWithoutSubscription';

/**
 * `@AllowWithoutSubscription()` — permite acceder a un endpoint autenticado antes de que el
 * usuario haya elegido un plan de suscripción (p. ej. `POST /user/subscription` o cierre de sesión).
 */
export const AllowWithoutSubscription = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_WITHOUT_SUBSCRIPTION_KEY, true);
