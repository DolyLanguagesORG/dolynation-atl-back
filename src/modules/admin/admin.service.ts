import { Inject, Injectable } from '@nestjs/common';
import { desc, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { users } from '../../database/drizzle/schema';
import { CATEGORIES } from '../readings/prompt-generation/catalog.constants';
import type { AdminCategoryDto, AdminUserRowDto } from './dto/admin-category.dto';

/** Cantidad máxima de usuarios devueltos por consulta en el panel de administración. */
const USERS_PAGE_SIZE = 50;

/**
 * Servicio con las operaciones de consulta y supervisión para administradores.
 */
@Injectable()
export class AdminService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Lista el catálogo global de categorías y sus subcategorías configuradas.
   */
  listCategories(): AdminCategoryDto[] {
    return CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      subcategories: c.subcategories.map((s) => s.name),
    }));
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
