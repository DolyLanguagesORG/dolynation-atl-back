import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * `@CurrentUser()` — extrae el usuario autenticado adjuntado por `JwtAuthGuard`.
 * Ejemplos de uso en un método de controlador:
 *   `@CurrentUser() user: AuthUser`
 *   `@CurrentUser('id') userId: number`
 */
export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
}

/** Decorador de parámetro para leer al usuario autenticado (o un campo suyo) desde la petición. */
export const CurrentUser = createParamDecorator(
  (
    field: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | number | string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
