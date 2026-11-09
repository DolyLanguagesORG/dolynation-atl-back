import { Inject, Injectable } from '@nestjs/common';
import { desc, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { users } from '../../database/drizzle/schema';
import { CATEGORIES } from '../readings/prompt-generation/catalog.constants';
import type { AdminCategoryDto, AdminUserRowDto } from './dto/admin-category.dto';

const USERS_PAGE_SIZE = 50;

@Injectable()
export class AdminService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  listCategories(): AdminCategoryDto[] {
    return CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      subcategories: c.subcategories.map((s) => s.name),
    }));
  }

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
