import { ExecutionContext, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import { RequestContextService } from '../../modules/logs';

/**
 * Guardia global de autenticación JWT aplicado en `CommonModule` (`APP_GUARD`).
 * Las rutas marcadas con `@Public()` omiten esta verificación; todas las demás
 * exigen un JWT Bearer válido en la cabecera `Authorization`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {
    super();
  }

  /** Permite el acceso directo si el método o controlador tiene el metadato `@Public()`. */
  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isOptional) {
      const request = context.switchToHttp().getRequest<{ headers?: { authorization?: string } }>();
      if (!request.headers?.authorization) return true;
    }
    return super.canActivate(context);
  }

  /** Normaliza la falta o invalidez del token lanzando `UnauthorizedException` y registra el actor en contexto. */
  override handleRequest<T = AuthUser>(err: unknown, user: T): T {
    if (err || !user) {
      throw new UnauthorizedException({
        code: 'AUTH.MISSING_TOKEN',
        message: 'Unauthorized',
      });
    }
    const authUser = user as unknown as AuthUser;
    if (typeof authUser.id === 'number') {
      this.requestContext?.setActor({
        id: authUser.id,
        email: authUser.email,
        role: authUser.role ?? null,
      });
    }
    return user;
  }
}

// Importado aquí para cumplir con la regla de importaciones solo de tipos.
import type { Observable } from 'rxjs';
