import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { userSettings } from '../../database/drizzle/schema';
import type { UserSettings } from '../../database/drizzle/types';
import { DEFAULT_LANGUAGE, type LanguageId } from './settings.constants';
import { CategoryModerationService } from '../moderation/category-moderation.service';

/**
 * Servicio que consulta y persiste las preferencias de categorías e idioma por usuario.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly moderation: CategoryModerationService,
  ) {}

  /**
   * Busca la fila de preferencias del usuario o devuelve `null` si aún no existe.
   */
  async findByUserId(userId: number): Promise<UserSettings | null> {
    const rows = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Devuelve las categorías preferidas del usuario (arreglo vacío si no configuró ninguna).
   */
  async getCategories(userId: number): Promise<string[]> {
    const row = await this.findByUserId(userId);
    return row?.preferredCategories ?? [];
  }

  /**
   * Devuelve el idioma configurado del usuario o `DEFAULT_LANGUAGE` como valor por defecto.
   */
  async getLanguage(userId: number): Promise<LanguageId> {
    const row = await this.findByUserId(userId);
    return (row?.preferredLanguage as LanguageId | undefined) ?? DEFAULT_LANGUAGE;
  }

  /**
   * Modera, normaliza y actualiza o crea las categorías preferidas del usuario.
   */
  async setCategories(userId: number, categories: string[]): Promise<string[]> {
    const moderated = await this.moderation.assertCategoriesAllowed(categories);
    await this.upsert(userId, { preferredCategories: moderated });
    return moderated;
  }

  /**
   * Actualiza o crea el idioma preferido del usuario.
   */
  async setLanguage(userId: number, language: LanguageId): Promise<LanguageId> {
    await this.upsert(userId, { preferredLanguage: language });
    return language;
  }

  /**
   * Inserta o actualiza (`upsert`) el registro de configuración en `user_settings`.
   */
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
