import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { roles, users } from '../../database/drizzle/schema';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Permite el paso de la solicitud únicamente cuando el usuario autenticado posee
 * el rol `admin` en la base de datos (`users.role_id` -> `roles.name = 'admin'`).
 * Debe ejecutarse DESPUÉS del `JwtAuthGuard` global para que `req.user` ya esté poblado.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Verifica en base de datos si el usuario autenticado tiene rol de administrador activo.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new AppHttpException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    const rows = await this.db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, user.id), isNull(users.deletedAt), eq(roles.name, 'admin')))
      .limit(1);

    if (rows.length === 0) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN);
    }
    return true;
  }
}
