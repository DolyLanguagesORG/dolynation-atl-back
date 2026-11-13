import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { userSettings } from '../../database/drizzle/schema';
import type { UserSettings } from '../../database/drizzle/types';
import { CategoryModerationService } from '../moderation/category-moderation.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { LanguagesSettingsDto } from './dto/settings-catalog.dto';
import {
  arraysEqual,
  canUseFreeAnnualChange,
  computeRemainingDays,
  getNextFreeChangeAt,
  haveSameLanguageSet,
  resolveActiveLanguages,
  sanitizeSelectedLanguages,
} from './language-selection.helpers';
import { SUPPORTED_LANGUAGES, type LanguageId } from './settings.constants';

interface SettingsUpsertPatch {
  preferredCategories?: string[];
  selectedLanguages?: LanguageId[];
  preferredLanguage?: string | null;
  lastLanguageChangeAt?: Date | null;
  languageChangeCredits?: number;
}

/**
 * Servicio que consulta y persiste las preferencias de categorías e idiomas por usuario,
 * haciendo cumplir los límites por plan, el bloqueo anual anti-trampa y los créditos pagados.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly moderation: CategoryModerationService,
    private readonly subscriptions: SubscriptionsService,
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
   * Devuelve el catálogo de idiomas, la selección priorizada del usuario, los idiomas
   * actualmente activos para su plan y el estado de bloqueo/créditos.
   */
  async getLanguagesSettings(userId: number): Promise<LanguagesSettingsDto> {
    const plan = await this.subscriptions.assertSubscriptionActive(userId);
    const row = await this.findByUserId(userId);
    return this.buildLanguagesDto(row, plan.maxLanguages);
  }

  /**
   * Devuelve únicamente los idiomas activos del usuario para lectura directa (p. ej. perfil),
   * recortados al máximo permitido por su suscripción sin lanzar errores si aún no eligió plan.
   */
  async getActiveLanguages(userId: number, maxLanguages: number): Promise<LanguageId[]> {
    const row = await this.findByUserId(userId);
    const saved = sanitizeSelectedLanguages(row?.selectedLanguages);
    return resolveActiveLanguages(saved, maxLanguages);
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
   * Guarda la selección ordenada de idiomas del usuario validando cupo del plan,
   * conservación sin costo cuando se agregan nuevos cupos/reordenan existentes y
   * bloqueo anual (o consumo de crédito pagado) cuando se reemplaza un idioma ya elegido.
   */
  async setLanguages(
    userId: number,
    rawLanguages: readonly string[],
  ): Promise<LanguagesSettingsDto> {
    const plan = await this.subscriptions.assertSubscriptionActive(userId);
    const requested = sanitizeSelectedLanguages(rawLanguages);

    if (requested.length === 0) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        message: 'At least one supported language (es, en, fr, it) must be selected.',
      });
    }

    if (requested.length > plan.maxLanguages) {
      throw new AppHttpException(ErrorCode.SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED, {
        message: `Plan '${plan.name}' allows at most ${plan.maxLanguages} simultaneous language(s). You requested ${requested.length}.`,
        plan: plan.id,
        maxLanguages: plan.maxLanguages,
        requestedLanguages: requested,
      });
    }

    const row = await this.findByUserId(userId);
    const saved = sanitizeSelectedLanguages(row?.selectedLanguages);
    const activeBefore = resolveActiveLanguages(saved, plan.maxLanguages);
    const lastChangeAt = row?.lastLanguageChangeAt ?? null;
    const credits = Math.max(0, row?.languageChangeCredits ?? 0);
    const now = new Date();

    // 1. Primera selección libre: fija el candado anual a partir de hoy.
    if (saved.length === 0) {
      await this.persistLanguages(userId, requested, now, credits);
      return this.buildLanguagesDtoFromValues(requested, now, credits, plan.maxLanguages, now);
    }

    // 2. Sin cambios o cliente enviando exactamente el bloque activo tras un downgrade.
    if (
      arraysEqual(requested, saved) ||
      (saved.length > plan.maxLanguages && arraysEqual(requested, activeBefore))
    ) {
      return this.buildLanguagesDtoFromValues(saved, lastChangeAt, credits, plan.maxLanguages, now);
    }

    // 3. Reordenamiento o llenado de nuevos cupos libres tras subir de plan sin eliminar ningún idioma previo.
    const removedAnySaved = saved.some((lang) => !requested.includes(lang));
    if (!removedAnySaved) {
      const effectiveLockDate = lastChangeAt ?? now;
      await this.persistLanguages(userId, requested, effectiveLockDate, credits);
      return this.buildLanguagesDtoFromValues(
        requested,
        effectiveLockDate,
        credits,
        plan.maxLanguages,
        now,
      );
    }

    // 4. Reemplazo o eliminación de un idioma ya elegido: exige espera anual o crédito pagado.
    const nextCredits = this.consumeUnlockQuotaOrThrow(
      saved,
      activeBefore,
      lastChangeAt,
      credits,
      now,
    );
    await this.persistLanguages(userId, requested, now, nextCredits);
    return this.buildLanguagesDtoFromValues(requested, now, nextCredits, plan.maxLanguages, now);
  }

  /**
   * Permite al usuario reordenar su lista guardada de idiomas (`index 0` = más importante)
   * sin agregar ni eliminar idiomas, protegiendo su prioridad ante un futuro downgrade.
   * Si el usuario ya hizo downgrade e intenta promover al bloque activo un idioma que quedó fuera,
   * aplica el mismo candado anual o crédito pagado para evitar rotación gratuita.
   */
  async reorderLanguages(
    userId: number,
    rawLanguages: readonly string[],
  ): Promise<LanguagesSettingsDto> {
    const plan = await this.subscriptions.assertSubscriptionActive(userId);
    const requested = sanitizeSelectedLanguages(rawLanguages);
    const row = await this.findByUserId(userId);
    const saved = sanitizeSelectedLanguages(row?.selectedLanguages);

    if (saved.length === 0) {
      throw new AppHttpException(ErrorCode.LANGUAGE_NOT_SELECTED, {
        message: 'You must select your study languages before reordering them.',
      });
    }

    if (!haveSameLanguageSet(saved, requested)) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        message:
          'Reordering must contain the exact same languages already saved without adding or removing any. Use PUT /settings/languages to change languages.',
        currentLanguages: saved,
        requestedLanguages: requested,
      });
    }

    const lastChangeAt = row?.lastLanguageChangeAt ?? null;
    const credits = Math.max(0, row?.languageChangeCredits ?? 0);
    const now = new Date();

    if (arraysEqual(saved, requested)) {
      return this.buildLanguagesDtoFromValues(saved, lastChangeAt, credits, plan.maxLanguages, now);
    }

    const activeBefore = resolveActiveLanguages(saved, plan.maxLanguages);
    const activeAfter = resolveActiveLanguages(requested, plan.maxLanguages);
    const introducesNewActive = activeAfter.some((lang) => !activeBefore.includes(lang));

    if (!introducesNewActive) {
      await this.persistLanguages(userId, requested, lastChangeAt, credits);
      return this.buildLanguagesDtoFromValues(
        requested,
        lastChangeAt,
        credits,
        plan.maxLanguages,
        now,
      );
    }

    const nextCredits = this.consumeUnlockQuotaOrThrow(
      saved,
      activeBefore,
      lastChangeAt,
      credits,
      now,
    );
    await this.persistLanguages(userId, requested, now, nextCredits);
    return this.buildLanguagesDtoFromValues(requested, now, nextCredits, plan.maxLanguages, now);
  }

  /**
   * Simula el pago manual de desbloqueo otorgando 1 crédito consumible para cambiar de idioma
   * antes de cumplir los 365 días, sin ampliar el límite de idiomas simultáneos del plan.
   */
  async unlockLanguageChange(userId: number): Promise<LanguagesSettingsDto> {
    const plan = await this.subscriptions.assertSubscriptionActive(userId);
    const row = await this.findByUserId(userId);
    const saved = sanitizeSelectedLanguages(row?.selectedLanguages);
    const lastChangeAt = row?.lastLanguageChangeAt ?? null;
    const nextCredits = Math.max(0, row?.languageChangeCredits ?? 0) + 1;

    await this.upsert(userId, { languageChangeCredits: nextCredits });
    return this.buildLanguagesDtoFromValues(
      saved,
      lastChangeAt,
      nextCredits,
      plan.maxLanguages,
      new Date(),
    );
  }

  private consumeUnlockQuotaOrThrow(
    saved: readonly LanguageId[],
    activeBefore: readonly LanguageId[],
    lastChangeAt: Date | null,
    credits: number,
    now: Date,
  ): number {
    if (canUseFreeAnnualChange(lastChangeAt, now)) {
      return credits;
    }

    if (credits > 0) {
      return credits - 1;
    }

    const nextFreeAt = getNextFreeChangeAt(lastChangeAt, now);
    const daysRemaining = nextFreeAt ? computeRemainingDays(nextFreeAt, now) : 365;
    throw new AppHttpException(ErrorCode.LANGUAGE_CHANGE_LOCKED, {
      message: `Your selected languages are locked. Next free change is available in ${daysRemaining} day(s)${nextFreeAt ? ` (${nextFreeAt.toISOString()})` : ''}, or unlock an immediate change via payment.`,
      currentLanguages: saved,
      activeLanguages: activeBefore,
      lastLanguageChangeAt: lastChangeAt?.toISOString() ?? null,
      nextFreeChangeAt: nextFreeAt?.toISOString() ?? null,
      daysRemaining,
      languageChangeCredits: credits,
    });
  }

  private async persistLanguages(
    userId: number,
    languages: LanguageId[],
    lastChangeAt: Date | null,
    credits: number,
  ): Promise<void> {
    await this.upsert(userId, {
      selectedLanguages: languages,
      preferredLanguage: languages[0] ?? null,
      lastLanguageChangeAt: lastChangeAt,
      languageChangeCredits: credits,
    });
  }

  private buildLanguagesDto(
    row: UserSettings | null,
    maxLanguages: number,
    now: Date = new Date(),
  ): LanguagesSettingsDto {
    const saved = sanitizeSelectedLanguages(row?.selectedLanguages);
    const lastChangeAt = row?.lastLanguageChangeAt ?? null;
    const credits = Math.max(0, row?.languageChangeCredits ?? 0);
    return this.buildLanguagesDtoFromValues(saved, lastChangeAt, credits, maxLanguages, now);
  }

  private buildLanguagesDtoFromValues(
    saved: LanguageId[],
    lastChangeAt: Date | null,
    credits: number,
    maxLanguages: number,
    now: Date,
  ): LanguagesSettingsDto {
    const catalog = SUPPORTED_LANGUAGES.map((l) => ({ id: l.id, name: l.name }));
    const active = resolveActiveLanguages(saved, maxLanguages);
    const canChangeFree = canUseFreeAnnualChange(lastChangeAt, now);
    const nextFreeAt = getNextFreeChangeAt(lastChangeAt, now);

    return {
      catalog,
      selected: [...saved],
      active,
      maxLanguages,
      canChangeFree,
      nextFreeChangeAt: nextFreeAt ? nextFreeAt.toISOString() : null,
      lastLanguageChangeAt: lastChangeAt ? lastChangeAt.toISOString() : null,
      languageChangeCredits: credits,
    };
  }

  /**
   * Inserta o actualiza (`upsert`) el registro de configuración en `user_settings`.
   */
  private async upsert(userId: number, patch: SettingsUpsertPatch): Promise<void> {
    const now = new Date();
    await this.db
      .insert(userSettings)
      .values({
        userId,
        preferredCategories: patch.preferredCategories ?? [],
        selectedLanguages: patch.selectedLanguages ?? [],
        preferredLanguage: patch.preferredLanguage ?? null,
        lastLanguageChangeAt: patch.lastLanguageChangeAt ?? null,
        languageChangeCredits: patch.languageChangeCredits ?? 0,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...patch, updatedAt: now },
      });
  }
}
