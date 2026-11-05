import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { admins } from '../../database/drizzle/schema';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Allows the request through only when the authenticated user has a row in
 * the `admins` table. Must run AFTER the global JwtAuthGuard so `req.user`
 * is populated. Returns RESOURCE_FORBIDDEN when the check fails.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new AppHttpException(ErrorCode.AUTH_UNAUTHORIZED);
    }

    const rows = await this.db
      .select({ userId: admins.userId })
      .from(admins)
      .where(eq(admins.userId, user.id))
      .limit(1);

    if (rows.length === 0) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN);
    }
    return true;
  }
}
