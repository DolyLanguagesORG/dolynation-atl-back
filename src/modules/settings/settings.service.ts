import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { userSettings } from '../../database/drizzle/schema';
import type { UserSettings } from '../../database/drizzle/types';
import { DEFAULT_LANGUAGE, type LanguageId } from './settings.constants';

@Injectable()
export class SettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByUserId(userId: number): Promise<UserSettings | null> {
    const rows = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getCategories(userId: number): Promise<string[]> {
    const row = await this.findByUserId(userId);
    return row?.preferredCategories ?? [];
  }

  async getLanguage(userId: number): Promise<LanguageId> {
    const row = await this.findByUserId(userId);
    return (row?.preferredLanguage as LanguageId | undefined) ?? DEFAULT_LANGUAGE;
  }

  async setCategories(userId: number, categories: string[]): Promise<string[]> {
    await this.upsert(userId, { preferredCategories: categories });
    return categories;
  }

  async setLanguage(userId: number, language: LanguageId): Promise<LanguageId> {
    await this.upsert(userId, { preferredLanguage: language });
    return language;
  }

  private async upsert(
    userId: number,
    patch: { preferredCategories?: string[]; preferredLanguage?: string },
  ): Promise<void> {
    const now = new Date();
    await this.db
      .insert(userSettings)
      .values({
        userId,
        preferredCategories: patch.preferredCategories ?? [],
        preferredLanguage: patch.preferredLanguage ?? DEFAULT_LANGUAGE,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...patch, updatedAt: now },
      });
  }
}
