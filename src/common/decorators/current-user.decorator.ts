import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * @CurrentUser() — extracts the authenticated user attached by JwtAuthGuard.
 * In a controller method:
 *   @CurrentUser() user: AuthUser
 *   @CurrentUser('id') userId: number
 */
export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
}

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
