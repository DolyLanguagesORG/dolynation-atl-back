import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Global JWT auth guard. Apply once at the AppModule level (APP_GUARD).
 * Routes decorated with @Public() bypass the guard.
 * Routes without it require a valid Bearer JWT in the Authorization header.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<T = AuthUser>(err: unknown, user: T): T {
    if (err || !user) {
      throw new UnauthorizedException({
        code: 'AUTH.MISSING_TOKEN',
        message: 'No valid access token provided',
      });
    }
    return user;
  }
}

// Imported here to satisfy the type-only import requirement
import type { Observable } from 'rxjs';
