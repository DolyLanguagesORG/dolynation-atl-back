import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/env.config';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { categoryDailyUsage } from '../../database/drizzle/schema';
import { AuditLogService } from '../logs';
import { canonicalCategoryKey } from '../moderation/category-normalizer';
import { getDateKeyInTimeZone, TIMEZONE_RESET } from '../subscriptions/subscriptions.constants';

/** Longitud máxima de la clave canónica persistida para una categoría dinámica. */
const MAX_CANONICAL_KEY_LENGTH = 120;

/**
 * Servicio anti-abuso encargado de limitar cuántas categorías dinámicas distintas
 * puede evaluar o configurar un usuario en un mismo día calendario (`America/Mexico_City`),
 * evitando ciclos de crear/eliminar para drenar tokens de IA.
 */
@Injectable()
export class CategoryDailyLimitService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: AppConfigService,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

  /** Devuelve el tope diario configurado de categorías nuevas distintas por usuario. */
  getDailyLimit(): number {
    return this.config.moderation.dailyCategoryLimit;
  }

  /**
   * Extrae las claves canónicas de categorías nuevas respecto a la selección previa.
   * Excluye reordenamientos y eliminaciones de categorías ya configuradas.
   */
  extractNewCustomCategoryKeys(
    candidateCategories: readonly string[],
    existingUserCategories: readonly string[],
  ): string[] {
    const existingKeys = new Set(
      existingUserCategories
        .map((c) => canonicalCategoryKey(c).slice(0, MAX_CANONICAL_KEY_LENGTH))
        .filter((k) => k.length > 0),
    );

    const seenInRequest = new Set<string>();
    const newKeys: string[] = [];

    for (const rawCategory of candidateCategories) {
      const key = canonicalCategoryKey(rawCategory).slice(0, MAX_CANONICAL_KEY_LENGTH);
      if (!key || existingKeys.has(key) || seenInRequest.has(key)) continue;
      seenInRequest.add(key);
      newKeys.push(key);
    }

    return newKeys;
  }

  /**
   * Valida y reserva de forma atómica el cupo diario de categorías nuevas evaluadas hoy,
   * devolviendo las claves recién consumidas en esta llamada.
   */
  async acquireDailyQuota(
    userId: number,
    candidateCategories: readonly string[],
    existingUserCategories: readonly string[],
    now: Date = new Date(),
  ): Promise<string[]> {
    const newCandidateKeys = this.extractNewCustomCategoryKeys(
      candidateCategories,
      existingUserCategories,
    );
    if (newCandidateKeys.length === 0) {
      return [];
    }

    const dailyLimit = this.getDailyLimit();
    const usageDate = getDateKeyInTimeZone(TIMEZONE_RESET, now);
    let acquiredKeys: string[] = [];

    await this.db.transaction(async (tx) => {
      // Serializa actualizaciones concurrentes del mismo usuario para impedir race conditions en el cupo
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

      const usedRows = await tx
        .select({ canonicalKey: categoryDailyUsage.canonicalKey })
        .from(categoryDailyUsage)
        .where(
          and(eq(categoryDailyUsage.userId, userId), eq(categoryDailyUsage.usageDate, usageDate)),
        );

      const usedTodayKeys = new Set(usedRows.map((row) => row.canonicalKey));
      const unseenTodayKeys = newCandidateKeys.filter((key) => !usedTodayKeys.has(key));
      if (unseenTodayKeys.length === 0) {
        return;
      }

      const usedCount = usedTodayKeys.size;
      if (usedCount + unseenTodayKeys.length > dailyLimit) {
        const remaining = Math.max(0, dailyLimit - usedCount);
        throw new AppHttpException(ErrorCode.CATEGORY_DAILY_LIMIT_REACHED, {
          message: `You have reached the daily limit of ${dailyLimit} new custom categories evaluated per day. Remaining today: ${remaining}.`,
          limit: dailyLimit,
          used: usedCount,
          remaining,
          attemptedNewCount: unseenTodayKeys.length,
        });
      }

      await tx
        .insert(categoryDailyUsage)
        .values(
          unseenTodayKeys.map((canonicalKey) => ({
            userId,
            usageDate,
            canonicalKey,
            createdAt: now,
          })),
        )
        .onConflictDoNothing();
      acquiredKeys = unseenTodayKeys;
    });

    if (acquiredKeys.length > 0) {
      await this.auditLogs?.logCreate({
        module: 'settings',
        event: 'settings.category_daily_quota_acquired',
        entityType: 'category_daily_usage',
        entityId: `${userId}:${usageDate}`,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Reserved ${acquiredKeys.length} daily custom category quota key(s) for user #${userId}`,
        afterState: { userId, usageDate, acquiredKeys },
      });
    }

    return acquiredKeys;
  }

  /**
   * Valida que las categorías nuevas enviadas no excedan el límite diario (`CATEGORY_DAILY_LIMIT`)
   * antes de invocar moderación externa/IA, y registra de forma atómica los nuevos términos evaluados hoy.
   *
   * Reordenar o eliminar categorías existentes no consume cupo diario.
   */
  async assertAndRecordDailyQuota(
    userId: number,
    candidateCategories: readonly string[],
    existingUserCategories: readonly string[],
    now: Date = new Date(),
  ): Promise<void> {
    await this.acquireDailyQuota(userId, candidateCategories, existingUserCategories, now);
  }

  /**
   * Libera claves recién reservadas cuando la moderación falla de forma transitoria (503 fail-closed),
   * evitando penalizar al usuario por una indisponibilidad del proveedor de IA.
   */
  async releaseDailyQuotaKeys(
    userId: number,
    canonicalKeys: readonly string[],
    now: Date = new Date(),
  ): Promise<void> {
    if (canonicalKeys.length === 0) {
      return;
    }
    const usageDate = getDateKeyInTimeZone(TIMEZONE_RESET, now);
    await this.db
      .delete(categoryDailyUsage)
      .where(
        and(
          eq(categoryDailyUsage.userId, userId),
          eq(categoryDailyUsage.usageDate, usageDate),
          inArray(categoryDailyUsage.canonicalKey, [...canonicalKeys]),
        ),
      );

    await this.auditLogs?.logDelete({
      module: 'settings',
      event: 'settings.category_daily_quota_released',
      entityType: 'category_daily_usage',
      entityId: `${userId}:${usageDate}`,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Released ${canonicalKeys.length} daily category quota key(s) after transient moderation error for user #${userId}`,
      beforeState: { userId, usageDate, releasedKeys: [...canonicalKeys] },
    });
  }
}
