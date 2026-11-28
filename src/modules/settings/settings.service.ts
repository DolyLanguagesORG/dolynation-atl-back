import { Inject, Injectable, Optional } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/env.config';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb, DrizzleExecutor } from '../../database/database.module';
import { users, userSettings } from '../../database/drizzle/schema';
import type { UserSettings } from '../../database/drizzle/types';
import { AuditLogService } from '../logs';
import { CategoryModerationService } from '../moderation/category-moderation.service';
import { canonicalCategoryKey, cleanCategoryDisplayName } from '../moderation/category-normalizer';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CategoryDailyLimitService } from './category-daily-limit.service';
import type {
  CatalogItemDto,
  CategoriesSettingsDto,
  LanguagesSettingsDto,
} from './dto/settings-catalog.dto';
import {
  arraysEqual,
  canUseFreeAnnualChange,
  computeRemainingDays,
  getNextFreeChangeAt,
  haveSameLanguageSet,
  resolveActiveLanguages,
  sanitizeSelectedLanguages,
} from './language-selection.helpers';
import {
  MAX_USER_SAVED_CATEGORIES,
  MIN_USER_CATEGORIES,
  SUPPORTED_LANGUAGE_IDS,
  SUPPORTED_LANGUAGES,
  type LanguageId,
} from './settings.constants';

interface SettingsUpsertPatch {
  preferredCategories?: string[];
  savedCategories?: string[];
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
    @Optional() private readonly dailyLimit?: CategoryDailyLimitService,
    @Optional() private readonly config?: AppConfigService,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

  /**
   * Busca la fila de preferencias del usuario o devuelve `null` si aún no existe.
   */
  async findByUserId(
    userId: number,
    dbClient: DrizzleExecutor = this.db,
  ): Promise<UserSettings | null> {
    const rows = await dbClient
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Devuelve las categorías activas del usuario (arreglo vacío si no configuró ninguna).
   */
  async getCategories(userId: number): Promise<string[]> {
    const row = await this.findByUserId(userId);
    return row?.preferredCategories ?? [];
  }

  /**
   * Devuelve únicamente el catálogo privado del usuario (`savedCategories ∪ preferredCategories`)
   * y su selección activa. Nunca expone categorías creadas por otros usuarios: la tabla
   * `moderated_categories` es solo caché interna de moderación/blueprints.
   */
  async getCategoriesSettings(userId: number): Promise<CategoriesSettingsDto> {
    const row = await this.findByUserId(userId);
    const selected = row?.preferredCategories ?? [];
    const library = mergeUniqueCategories(row?.savedCategories ?? [], selected);
    return {
      catalog: library.map((name): CatalogItemDto => ({ id: name, name })),
      selected,
    };
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
   * Modera, valida el tope diario anti-abuso, normaliza y actualiza o crea las categorías
   * activas del usuario conservando su biblioteca privada para poder deseleccionarlas sin perderlas.
   */
  async setCategories(userId: number, categories: string[]): Promise<string[]> {
    if (categories.length < MIN_USER_CATEGORIES) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        minCategories: MIN_USER_CATEGORIES,
        received: categories.length,
        message: `Debes registrar al menos ${MIN_USER_CATEGORIES} categorías únicas.`,
      });
    }

    const existingRow = await this.findByUserId(userId);
    const existingSelected = existingRow?.preferredCategories ?? [];
    const existingLibrary = mergeUniqueCategories(
      existingRow?.savedCategories ?? [],
      existingSelected,
    );

    let acquiredKeys: string[] = [];
    if (this.dailyLimit) {
      if (typeof this.dailyLimit.acquireDailyQuota === 'function') {
        acquiredKeys = await this.dailyLimit.acquireDailyQuota(userId, categories, existingLibrary);
      } else {
        await this.dailyLimit.assertAndRecordDailyQuota(userId, categories, existingLibrary);
      }
    }

    let moderated: string[];
    try {
      moderated = await this.moderation.assertCategoriesAllowed(categories);
    } catch (err) {
      if (
        this.dailyLimit &&
        acquiredKeys.length > 0 &&
        typeof this.dailyLimit.releaseDailyQuotaKeys === 'function' &&
        err instanceof AppHttpException &&
        err.getStatus() === 503
      ) {
        await this.dailyLimit.releaseDailyQuotaKeys(userId, acquiredKeys);
      }
      throw err;
    }

    const nextSaved = mergeUniqueCategories(existingLibrary, moderated);
    await this.upsert(userId, {
      preferredCategories: moderated,
      savedCategories: nextSaved,
    });

    const beforeState = {
      preferredCategories: existingSelected,
      savedCategories: existingRow?.savedCategories ?? [],
    };
    const afterState = {
      preferredCategories: moderated,
      savedCategories: nextSaved,
    };
    if (!existingRow) {
      await this.auditLogs?.logCreate({
        module: 'settings',
        event: 'settings.categories_created',
        entityType: 'user_settings',
        entityId: userId,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Initial categories configured for user #${userId} (${moderated.length} selected)`,
        afterState,
        metadata: { acquiredDailyQuotaKeys: acquiredKeys },
      });
    } else {
      await this.auditLogs?.logUpdate({
        module: 'settings',
        event: 'settings.categories_updated',
        entityType: 'user_settings',
        entityId: userId,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Categories updated for user #${userId} (${moderated.length} selected)`,
        beforeState,
        afterState,
        metadata: { acquiredDailyQuotaKeys: acquiredKeys },
      });
    }

    return moderated;
  }

  /**
   * Elimina una categoría de la biblioteca privada (y de la selección activa si estaba marcada)
   * del usuario sin borrarla de `moderated_categories`, preservando el ahorro de llamadas a la IA.
   */
  async removeCategory(userId: number, rawCategory: string): Promise<CategoriesSettingsDto> {
    await this.subscriptions.assertSubscriptionActive(userId);
    const cleaned = cleanCategoryDisplayName(rawCategory);
    const targetKey = canonicalCategoryKey(cleaned);
    if (!targetKey) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        field: 'category',
        message: 'Debes indicar una categoría válida para eliminar.',
      });
    }

    const row = await this.findByUserId(userId);
    const existingSelected = row?.preferredCategories ?? [];
    const existingLibrary = mergeUniqueCategories(row?.savedCategories ?? [], existingSelected);

    const existsInLibrary = existingLibrary.some(
      (item) => canonicalCategoryKey(item) === targetKey,
    );
    if (!existsInLibrary) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, {
        resource: 'Category',
        category: cleaned,
      });
    }

    const nextSelected = existingSelected.filter(
      (item) => canonicalCategoryKey(item) !== targetKey,
    );
    const wasSelected = nextSelected.length !== existingSelected.length;
    if (wasSelected && nextSelected.length < MIN_USER_CATEGORIES) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        minCategories: MIN_USER_CATEGORIES,
        remainingSelected: nextSelected.length,
        message: `Debes mantener al menos ${MIN_USER_CATEGORIES} categorías activas para generar lecturas. Agrega o activa otra antes de eliminar "${cleaned}".`,
      });
    }

    const nextSaved = existingLibrary.filter((item) => canonicalCategoryKey(item) !== targetKey);
    await this.upsert(userId, {
      preferredCategories: nextSelected,
      savedCategories: nextSaved,
    });

    await this.auditLogs?.logUpdate({
      module: 'settings',
      event: 'settings.category_removed',
      entityType: 'user_settings',
      entityId: userId,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Category "${cleaned}" removed from user #${userId} library`,
      beforeState: {
        preferredCategories: existingSelected,
        savedCategories: existingLibrary,
      },
      afterState: {
        preferredCategories: nextSelected,
        savedCategories: nextSaved,
      },
      metadata: {
        removedCategory: cleaned,
        canonicalKey: targetKey,
        wasSelected,
      },
    });

    return {
      catalog: nextSaved.map((name): CatalogItemDto => ({ id: name, name })),
      selected: nextSelected,
    };
  }

  /**
   * Valida, modera y reserva el cupo diario de una categoría individual antes de confirmarla en bloque,
   * permitiendo al onboarding y al perfil ofrecer retroalimentación inmediata al agregar cada tema.
   */
  async validateCategory(userId: number, rawCategory: string): Promise<string> {
    await this.subscriptions.assertSubscriptionActive(userId);
    const cleaned = cleanCategoryDisplayName(rawCategory);
    if (cleaned.length < 2 || cleaned.length > 50) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        field: 'category',
        message: 'La categoría debe tener entre 2 y 50 caracteres.',
      });
    }

    const existingRow = await this.findByUserId(userId);
    const existingSelected = existingRow?.preferredCategories ?? [];
    const existingLibrary = mergeUniqueCategories(
      existingRow?.savedCategories ?? [],
      existingSelected,
    );

    let acquiredKeys: string[] = [];
    if (this.dailyLimit) {
      if (typeof this.dailyLimit.acquireDailyQuota === 'function') {
        acquiredKeys = await this.dailyLimit.acquireDailyQuota(userId, [cleaned], existingLibrary);
      } else {
        await this.dailyLimit.assertAndRecordDailyQuota(userId, [cleaned], existingLibrary);
      }
    }

    let moderated: string[];
    try {
      moderated = await this.moderation.assertCategoriesAllowed([cleaned]);
    } catch (err) {
      if (
        this.dailyLimit &&
        acquiredKeys.length > 0 &&
        typeof this.dailyLimit.releaseDailyQuotaKeys === 'function' &&
        err instanceof AppHttpException &&
        err.getStatus() === 503
      ) {
        await this.dailyLimit.releaseDailyQuotaKeys(userId, acquiredKeys);
      }
      throw err;
    }

    return moderated[0] ?? cleaned;
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
    return this.db.transaction((tx) => this.setLanguagesLocked(userId, rawLanguages, tx));
  }

  /** Aplica cupos, cambios anuales y créditos dentro de la transacción que serializa la selección. */
  private async setLanguagesLocked(
    userId: number,
    rawLanguages: readonly string[],
    tx: DrizzleExecutor,
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

    const row = await this.lockLanguageSettings(userId, tx);
    const saved = sanitizeSelectedLanguages(row?.selectedLanguages);
    const activeBefore = resolveActiveLanguages(saved, plan.maxLanguages);
    const lastChangeAt = row?.lastLanguageChangeAt ?? null;
    const credits = Math.max(0, row?.languageChangeCredits ?? 0);
    const now = new Date();

    // 1. Primera selección libre: fija el candado anual a partir de hoy.
    if (saved.length === 0) {
      await this.persistLanguages(userId, requested, now, credits, tx);
      await this.auditLogs?.logUpdate({
        module: 'settings',
        event: 'settings.languages_selected',
        entityType: 'user_settings',
        entityId: userId,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Initial study languages selected for user #${userId}: [${requested.join(', ')}]`,
        beforeState: {
          selectedLanguages: saved,
          lastLanguageChangeAt: lastChangeAt,
          languageChangeCredits: credits,
        },
        afterState: {
          selectedLanguages: requested,
          lastLanguageChangeAt: now,
          languageChangeCredits: credits,
        },
      });
      return this.buildLanguagesDtoFromValues(requested, now, credits, plan.maxLanguages, now);
    }

    // 2. Sin cambios o cliente enviando exactamente el bloque activo tras un downgrade.
    if (
      arraysEqual(requested, saved) ||
      (saved.length > plan.maxLanguages && arraysEqual(requested, activeBefore))
    ) {
      return this.buildLanguagesDtoFromValues(saved, lastChangeAt, credits, plan.maxLanguages, now);
    }

    // 3. Plan total (dolly_pro) o reordenamiento/llenado sin eliminar ningún idioma previo: sin bloqueo ni gasto de crédito.
    const isUnlimitedLanguagesPlan = plan.maxLanguages >= SUPPORTED_LANGUAGE_IDS.length;
    const removedAnySaved = saved.some((lang) => !requested.includes(lang));
    if (isUnlimitedLanguagesPlan || !removedAnySaved) {
      const effectiveLockDate = isUnlimitedLanguagesPlan ? now : (lastChangeAt ?? now);
      await this.persistLanguages(userId, requested, effectiveLockDate, credits, tx);
      await this.auditLogs?.logUpdate({
        module: 'settings',
        event: 'settings.languages_updated',
        entityType: 'user_settings',
        entityId: userId,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Study languages updated for user #${userId}: [${saved.join(', ')}] -> [${requested.join(', ')}]`,
        beforeState: {
          selectedLanguages: saved,
          lastLanguageChangeAt: lastChangeAt,
          languageChangeCredits: credits,
        },
        afterState: {
          selectedLanguages: requested,
          lastLanguageChangeAt: effectiveLockDate,
          languageChangeCredits: credits,
        },
        metadata: { plan: plan.id },
      });
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
    await this.persistLanguages(userId, requested, now, nextCredits, tx);
    await this.auditLogs?.logUpdate({
      module: 'settings',
      event: 'settings.languages_replaced',
      entityType: 'user_settings',
      entityId: userId,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Study languages replaced for user #${userId}: [${saved.join(', ')}] -> [${requested.join(', ')}]`,
      beforeState: {
        selectedLanguages: saved,
        activeLanguages: activeBefore,
        lastLanguageChangeAt: lastChangeAt,
        languageChangeCredits: credits,
      },
      afterState: {
        selectedLanguages: requested,
        lastLanguageChangeAt: now,
        languageChangeCredits: nextCredits,
      },
      metadata: { plan: plan.id, creditConsumed: nextCredits < credits },
    });
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
    return this.db.transaction((tx) => this.reorderLanguagesLocked(userId, rawLanguages, tx));
  }

  /** Reordena una selección sin cambiar sus elementos y aplica bloqueos al promover idiomas inactivos. */
  private async reorderLanguagesLocked(
    userId: number,
    rawLanguages: readonly string[],
    tx: DrizzleExecutor,
  ): Promise<LanguagesSettingsDto> {
    const plan = await this.subscriptions.assertSubscriptionActive(userId);
    const requested = sanitizeSelectedLanguages(rawLanguages);
    const row = await this.lockLanguageSettings(userId, tx);
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
      await this.persistLanguages(userId, requested, lastChangeAt, credits, tx);
      await this.auditLogs?.logUpdate({
        module: 'settings',
        event: 'settings.languages_reordered',
        entityType: 'user_settings',
        entityId: userId,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Study languages reordered for user #${userId}: [${saved.join(', ')}] -> [${requested.join(', ')}]`,
        beforeState: {
          selectedLanguages: saved,
          activeLanguages: activeBefore,
          lastLanguageChangeAt: lastChangeAt,
          languageChangeCredits: credits,
        },
        afterState: {
          selectedLanguages: requested,
          activeLanguages: activeAfter,
          lastLanguageChangeAt: lastChangeAt,
          languageChangeCredits: credits,
        },
      });
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
    await this.persistLanguages(userId, requested, now, nextCredits, tx);
    await this.auditLogs?.logUpdate({
      module: 'settings',
      event: 'settings.languages_reordered_promoted',
      entityType: 'user_settings',
      entityId: userId,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Study language promoted via reorder for user #${userId}: [${saved.join(', ')}] -> [${requested.join(', ')}]`,
      beforeState: {
        selectedLanguages: saved,
        activeLanguages: activeBefore,
        lastLanguageChangeAt: lastChangeAt,
        languageChangeCredits: credits,
      },
      afterState: {
        selectedLanguages: requested,
        activeLanguages: activeAfter,
        lastLanguageChangeAt: now,
        languageChangeCredits: nextCredits,
      },
      metadata: { creditConsumed: nextCredits < credits },
    });
    return this.buildLanguagesDtoFromValues(requested, now, nextCredits, plan.maxLanguages, now);
  }

  /**
   * Simula el pago manual de desbloqueo otorgando 1 crédito consumible para cambiar de idioma
   * antes de cumplir los 365 días, sin ampliar el límite de idiomas simultáneos del plan.
   */
  async unlockLanguageChange(userId: number): Promise<LanguagesSettingsDto> {
    if (this.config?.billing.provider === 'stripe') {
      throw new AppHttpException(ErrorCode.BILLING_PAYMENT_REQUIRED, {
        requestType: 'language_unlock',
      });
    }

    if (this.config?.accessRequests.enabled) {
      throw new AppHttpException(ErrorCode.ACCESS_REQUEST_REQUIRED, {
        requestType: 'language_unlock',
      });
    }

    const plan = await this.subscriptions.assertSubscriptionActive(userId);
    const { saved, lastChangeAt, nextCredits } = await this.grantLanguageChangeCredit(userId);
    return this.buildLanguagesDtoFromValues(
      saved,
      lastChangeAt,
      nextCredits,
      plan.maxLanguages,
      new Date(),
    );
  }

  /**
   * Acredita +1 crédito de cambio de idioma de forma reutilizable (manual, admin o Stripe).
   * Acepta una transacción Drizzle opcional para garantizar atomicidad junto con el registro de pago.
   */
  async grantLanguageChangeCredit(
    userId: number,
    dbClient: DrizzleExecutor = this.db,
  ): Promise<{
    saved: LanguageId[];
    lastChangeAt: Date | null;
    previousCredits: number;
    nextCredits: number;
  }> {
    const row = await this.findByUserId(userId, dbClient);
    const saved = sanitizeSelectedLanguages(row?.selectedLanguages);
    const lastChangeAt = row?.lastLanguageChangeAt ?? null;
    const previousCredits = Math.max(0, row?.languageChangeCredits ?? 0);

    // El incremento es ATOMICO (`credits = credits + 1`), no un
    // leer-modificar-escribir. Dos compras simultaneas del mismo usuario
    // (dos sesiones de checkout distintas) leian las dos 0 y escribian las
    // dos 1: el usuario pagaba dos y recibia un solo credito.
    await this.incrementLanguageChangeCredits(userId, dbClient);

    const nextCredits = previousCredits + 1;

    // B-6: cuando se ejecuta dentro de una transacción ajena (`tx !== this.db`),
    // quien abre y confirma la transacción debe emitir la auditoría tras el commit
    // para evitar registros de crédito fantasma si la transacción hace rollback.
    if (dbClient === this.db) {
      await this.auditLogs?.logUpdate({
        module: 'settings',
        event: 'settings.language_change_unlocked',
        entityType: 'user_settings',
        entityId: userId,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Language change unlock credit granted to user #${userId} (${previousCredits} -> ${nextCredits})`,
        beforeState: { languageChangeCredits: previousCredits },
        afterState: { languageChangeCredits: nextCredits },
      });
    }

    return { saved, lastChangeAt, previousCredits, nextCredits };
  }

  /** Conserva créditos si el cambio anual es gratuito, consume uno disponible o rechaza el cambio. */
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

  /** Persiste idiomas, prioridad, fecha de cambio y saldo de créditos en la fila del usuario. */
  private async persistLanguages(
    userId: number,
    languages: LanguageId[],
    lastChangeAt: Date | null,
    credits: number,
    dbClient: DrizzleExecutor,
  ): Promise<void> {
    await this.upsert(
      userId,
      {
        selectedLanguages: languages,
        preferredLanguage: languages[0] ?? null,
        lastLanguageChangeAt: lastChangeAt,
        languageChangeCredits: credits,
      },
      dbClient,
    );
  }

  /**
   * Lee la configuración de idiomas bloqueando al usuario y su fila de `user_settings`
   * hasta el fin de la transacción. Serializa los cambios de idioma concurrentes y hace
   * esperar al abono de créditos (`incrementLanguageChangeCredits`), para que el crédito
   * leído aquí sea el mismo que se descuenta al guardar.
   */
  private async lockLanguageSettings(
    userId: number,
    tx: DrizzleExecutor,
  ): Promise<UserSettings | null> {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update');
    const rows = await tx
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .for('update');
    return rows[0] ?? null;
  }

  /** Construye la respuesta de idiomas desde la configuración persistida del usuario. */
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

  /** Calcula idiomas activos y opciones de cambio a partir de valores ya normalizados. */
  private buildLanguagesDtoFromValues(
    saved: LanguageId[],
    lastChangeAt: Date | null,
    credits: number,
    maxLanguages: number,
    now: Date,
  ): LanguagesSettingsDto {
    const catalog = SUPPORTED_LANGUAGES.map((l) => ({ id: l.id, name: l.name }));
    const active = resolveActiveLanguages(saved, maxLanguages);
    const isUnlimitedLanguagesPlan = maxLanguages >= SUPPORTED_LANGUAGE_IDS.length;
    const canChangeFree = isUnlimitedLanguagesPlan || canUseFreeAnnualChange(lastChangeAt, now);
    const nextFreeAt = isUnlimitedLanguagesPlan ? null : getNextFreeChangeAt(lastChangeAt, now);

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
  /**
   * Incrementa atomicamente el credito de cambio de idioma.
   *
   * El incremento lo hace la base (`credits = credits + 1`), no el proceso:
   * dos compras simultaneas del mismo usuario se serializan solas.
   */
  private async incrementLanguageChangeCredits(
    userId: number,
    dbClient: DrizzleExecutor = this.db,
  ): Promise<void> {
    const now = new Date();

    const updated = await dbClient
      .update(userSettings)
      .set({
        languageChangeCredits: sql`COALESCE(${userSettings.languageChangeCredits}, 0) + 1`,
        updatedAt: now,
      })
      .where(eq(userSettings.userId, userId))
      .returning({ userId: userSettings.userId });

    if (updated.length > 0) {
      return;
    }

    // La fila no existia: se crea. El ON CONFLICT tambien SUMA, no fija,
    // asi que dos inserciones simultaneas no se pisan.
    await dbClient
      .insert(userSettings)
      .values({
        userId,
        selectedLanguages: [],
        preferredCategories: [],
        savedCategories: [],
        languageChangeCredits: 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          languageChangeCredits: sql`COALESCE(${userSettings.languageChangeCredits}, 0) + 1`,
          updatedAt: now,
        },
      });
  }

  /** Inserta la configuración inicial o actualiza solo los campos entregados por el flujo. */
  private async upsert(
    userId: number,
    patch: SettingsUpsertPatch,
    dbClient: DrizzleExecutor = this.db,
  ): Promise<void> {
    const now = new Date();
    await dbClient
      .insert(userSettings)
      .values({
        userId,
        preferredCategories: patch.preferredCategories ?? [],
        savedCategories: patch.savedCategories ?? [],
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

/** Fusiona categorías guardadas y activas por clave canónica, conservando el orden y la forma más reciente. */
function mergeUniqueCategories(
  existingSaved: readonly string[],
  activeOrAdded: readonly string[],
): string[] {
  const byKey = new Map<string, string>();
  const orderedKeys: string[] = [];

  const upsertEntry = (raw: string): void => {
    const cleaned = cleanCategoryDisplayName(raw);
    const key = canonicalCategoryKey(cleaned);
    if (!key) return;
    if (!byKey.has(key)) {
      orderedKeys.push(key);
    }
    byKey.set(key, cleaned);
  };

  for (const cat of existingSaved) upsertEntry(cat);
  for (const cat of activeOrAdded) upsertEntry(cat);

  const merged = orderedKeys
    .map((key) => byKey.get(key))
    .filter((value): value is string => typeof value === 'string');

  if (merged.length <= MAX_USER_SAVED_CATEGORIES) {
    return merged;
  }

  const activeKeys = new Set(
    activeOrAdded.map((cat) => canonicalCategoryKey(cat)).filter((key) => key.length > 0),
  );
  const activeItems = merged.filter((cat) => activeKeys.has(canonicalCategoryKey(cat)));
  const inactiveItems = merged.filter((cat) => !activeKeys.has(canonicalCategoryKey(cat)));
  const remainingSlots = Math.max(0, MAX_USER_SAVED_CATEGORIES - activeItems.length);
  return [...inactiveItems.slice(-remainingSlots), ...activeItems];
}
