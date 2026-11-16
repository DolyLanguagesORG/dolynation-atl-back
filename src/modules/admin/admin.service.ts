import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { promptLogs, users } from '../../database/drizzle/schema';
import type {
  AdminCategoryDto,
  AdminPromptLogDto,
  AdminUserRowDto,
} from './dto/admin-category.dto';

/** Cantidad máxima de usuarios devueltos por consulta en el panel de administración. */
const USERS_PAGE_SIZE = 50;

/** Cantidad máxima de fallos de la IA devueltos por consulta. */
const PROMPT_LOGS_PAGE_SIZE = 50;

/**
 * Servicio con las operaciones de consulta y supervisión para administradores.
 */
@Injectable()
export class AdminService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Sin categorías predefinidas en el sistema: las categorías son dinámicas y definidas por cada usuario.
   */
  listCategories(): AdminCategoryDto[] {
    return [];
  }

  /**
   * Lista los **fallos del proveedor de IA** registrados en `prompt_logs`.
   *
   * Es la vía para diagnosticar un 429/503 de la IA **sin entrar al servidor**:
   * aquí está el error original del provider (el 429 de Google, un timeout,
   * una respuesta que no parsea) que la API no filtra al cliente final.
   *
   * Solo lo ven los administradores (`AdminGuard`).
   */
  async listPromptLogs(
    limit = PROMPT_LOGS_PAGE_SIZE,
    onlyErrors = true,
  ): Promise<AdminPromptLogDto[]> {
    const rows = await this.db
      .select({
        id: promptLogs.id,
        level: promptLogs.level,
        event: promptLogs.event,
        errorMessage: promptLogs.errorMessage,
        message: promptLogs.message,
        userId: promptLogs.userId,
        createdAt: promptLogs.createdAt,
      })
      .from(promptLogs)
      .where(onlyErrors ? eq(promptLogs.level, 'error') : undefined)
      .orderBy(desc(promptLogs.createdAt))
      .limit(limit);

    return rows;
  }

  /**
   * Lista los usuarios activos ordenados del más reciente al más antiguo.
   */
  async listUsers(limit = USERS_PAGE_SIZE): Promise<AdminUserRowDto[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(desc(users.createdAt))
      .limit(limit);
    return rows;
  }
}
