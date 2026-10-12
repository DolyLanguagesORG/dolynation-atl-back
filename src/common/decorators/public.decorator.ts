import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — marks a controller or handler as not requiring authentication.
 * Used together with a global JwtAuthGuard to opt-out specific routes (login, register, health, docs).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
