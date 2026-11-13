import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { users, userSettings, readings } from '../../database/drizzle/schema';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { type NewUser, type User } from '../../database/drizzle/types';
import * as argon2 from 'argon2';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { LanguageId } from '../settings/settings.constants';
import {
  resolveActiveLanguages,
  sanitizeSelectedLanguages,
} from '../settings/language-selection.helpers';
import { getMaxLanguagesForTier } from '../subscriptions/subscriptions.constants';
import { DEFAULT_UI_LOCALE } from '../../common/types/locale';

/** Campos permitidos al actualizar el perfil de usuario. */
export interface UpdateProfileInput {
  fullName?: string;
}

/** Representación pública y segura de un usuario (sin hash de contraseña ni campos internos). */
export interface PublicUser {
  id: number;
  email: string;
  fullName: string | null;
  subscriptionTier: string | null;
  currentStreak: number;
  lastStreakDate: string | null;
  /** Marca de verificación del correo; `null` si la cuenta todavía no lo confirmó. */
  emailVerifiedAt: Date | null;
  /** Locale de interfaz del usuario (`es` | `en`), usado en los correos transaccionales. */
  locale: string;
  createdAt: Date;
}

/** Perfil completo devuelto en `/user/profile` con los idiomas activos permitidos para generar lecturas. */
export interface UserProfile extends PublicUser {
  selectedLanguages: LanguageId[];
}

/**
 * Servicio de gestión de cuentas de usuario, credenciales Argon2id, perfil público y rachas.
 */
@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Busca un usuario por su correo electrónico. */
  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  /** Busca un usuario por su identificador primario. */
  async findById(id: number): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /**
   * Crea un nuevo usuario generando el hash Argon2id de la contraseña e inicializando su racha en 0.
   *
   * @param input Datos de la alta. `locale` es el locale de interfaz del usuario
   *              (`es` | `en`) y determina el idioma de los correos transaccionales.
   */
  async create(input: {
    email: string;
    password: string;
    fullName: string;
    locale?: string;
  }): Promise<User> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const now = new Date();
    const row: NewUser = {
      email: input.email,
      password: passwordHash,
      currentStreak: 0,
      locale: input.locale ?? DEFAULT_UI_LOCALE,
      createdAt: now,
    };
    const [inserted] = await this.db.insert(users).values(row).returning();
    if (!inserted) throw new Error('User insert returned no row');
    if (input.fullName.length > 0) {
      await this.db
        .update(users)
        .set({ fullName: input.fullName })
        .where(eq(users.id, inserted.id));
      return { ...inserted, fullName: input.fullName };
    }
    return inserted;
  }

  /** Verifica una contraseña en texto plano frente al hash almacenado. */
  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Proyecta una entidad `User` de base de datos al formato público expuesto por la API. */
  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      subscriptionTier: user.subscriptionTier ?? null,
      currentStreak: this.effectiveStreakCount(user.lastStreakDate, user.currentStreak),
      lastStreakDate: user.lastStreakDate,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
      locale: user.locale,
      createdAt: user.createdAt,
    };
  }

  /**
   * Actualiza la contraseña de una cuenta generando un nuevo hash Argon2id.
   *
   * Se usa en el flujo de restablecimiento de contraseña. Lanza
   * `RESOURCE_NOT_FOUND` si la cuenta ya no existe.
   */
  async updatePassword(userId: number, plainPassword: string): Promise<void> {
    const passwordHash = await argon2.hash(plainPassword, { type: argon2.argon2id });
    const [updated] = await this.db
      .update(users)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!updated) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND);
    }
  }

  /**
   * Marca el correo de la cuenta como verificado.
   *
   * Es idempotente: volver a llamarla no cambia la marca original.
   */
  async markEmailVerified(userId: number): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Calcula la racha actual de un usuario de forma pura (sin escribir en base de datos).
   */
  computeStreak(lastStreakDate: string | null, today: Date, currentStreak: number): number {
    if (!lastStreakDate) return 0;
    const last = new Date(lastStreakDate + 'T00:00:00Z');
    const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const diffDays = Math.round((t.getTime() - last.getTime()) / 86_400_000);
    if (diffDays === 0) return currentStreak;
    if (diffDays === 1) return currentStreak + 1;
    return 0;
  }

  /**
   * Devuelve el perfil del usuario autenticado incluyendo sus idiomas activos para lecturas.
   * Lanza `RESOURCE_NOT_FOUND` si el registro fue eliminado entre la emisión del token y la petición.
   */
  async getProfile(userId: number): Promise<UserProfile> {
    const user = await this.findById(userId);
    if (!user) throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND);
    return this.toProfile(user);
  }

  /**
   * Actualiza los campos editables del perfil. Solo se acepta `fullName`; el correo y la
   * contraseña se modifican mediante flujos dedicados (no implementados aquí).
   * Se permiten peticiones PATCH sin cambios y devuelven el registro actual.
   */
  async updateProfile(userId: number, input: UpdateProfileInput): Promise<UserProfile> {
    const user = await this.findById(userId);
    if (!user) throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND);

    const patch: { fullName?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (input.fullName !== undefined) {
      patch.fullName = input.fullName.trim();
    }

    if (patch.fullName === undefined) {
      return this.toProfile(user);
    }

    const [updated] = await this.db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND);
    return this.toProfile(updated);
  }

  private async toProfile(user: User): Promise<UserProfile> {
    const selectedLanguages = await this.getActiveSelectedLanguages(
      user.id,
      user.subscriptionTier ?? null,
    );
    return {
      ...this.toPublic(user),
      selectedLanguages,
    };
  }

  private async getActiveSelectedLanguages(
    userId: number,
    subscriptionTier: string | null,
  ): Promise<LanguageId[]> {
    const maxLanguages = getMaxLanguagesForTier(subscriptionTier);
    if (maxLanguages <= 0) {
      return [];
    }

    const rows = await this.db
      .select({ selectedLanguages: userSettings.selectedLanguages })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const saved = sanitizeSelectedLanguages(rows[0]?.selectedLanguages);
    return resolveActiveLanguages(saved, maxLanguages);
  }

  /**
   * Evalúa si la racha almacenada sigue vigente respecto a `today` (actividad hoy o ayer).
   */
  private effectiveStreakCount(
    lastStreakDate: string | null,
    currentStreak: number,
    today = new Date(),
  ): number {
    if (!lastStreakDate || currentStreak <= 0) return 0;
    const last = new Date(lastStreakDate + 'T00:00:00Z');
    const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const diffDays = Math.round((t.getTime() - last.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 1 ? currentStreak : 0;
  }

  /**
   * Registra actividad de estudio completada hoy actualizando `currentStreak` y `lastStreakDate`.
   */
  async recordDailyActivity(userId: number, today = new Date()): Promise<void> {
    const user = await this.findById(userId);
    if (!user) return;

    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const todayStr = todayUtc.toISOString().slice(0, 10);

    let nextStreak = 1;
    if (user.lastStreakDate) {
      const last = new Date(user.lastStreakDate + 'T00:00:00Z');
      const diffDays = Math.round((todayUtc.getTime() - last.getTime()) / 86_400_000);
      if (diffDays < 0) {
        return;
      }
      if (diffDays === 0) {
        nextStreak = Math.max(1, user.currentStreak);
        if (user.currentStreak >= 1 && user.lastStreakDate === todayStr) {
          return;
        }
      } else if (diffDays === 1) {
        nextStreak = Math.max(0, user.currentStreak) + 1;
      } else {
        nextStreak = 1;
      }
    }

    await this.db
      .update(users)
      .set({
        currentStreak: nextStreak,
        lastStreakDate: todayStr,
        updatedAt: today,
      })
      .where(eq(users.id, userId));
  }

  /**
   * Genera la serie de actividad reciente por día para la ventana solicitada.
   */
  async activeStreakFor(userId: number, days = 7, today = new Date()): Promise<number[]> {
    const windowDays = Math.max(1, Math.min(365, Math.floor(days)));
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const windowStart = new Date(todayUtc.getTime() - (windowDays - 1) * 86_400_000);

    const windowDates = Array.from({ length: windowDays }, (_, idx) =>
      new Date(windowStart.getTime() + idx * 86_400_000).toISOString().slice(0, 10),
    );
    const windowSet = new Set(windowDates);
    const activeDates = new Set<string>();

    const [user, completedRows] = await Promise.all([
      this.findById(userId),
      this.db
        .select({
          updatedAt: readings.updatedAt,
          createdAt: readings.createdAt,
        })
        .from(readings)
        .where(
          and(
            eq(readings.userId, userId),
            eq(readings.status, 'completed'),
            isNull(readings.deletedAt),
            gte(sql`COALESCE(${readings.updatedAt}, ${readings.createdAt})`, windowStart),
          ),
        ),
    ]);

    for (const row of completedRows) {
      const activityDate = (row.updatedAt ?? row.createdAt).toISOString().slice(0, 10);
      if (windowSet.has(activityDate)) {
        activeDates.add(activityDate);
      }
    }

    if (user?.lastStreakDate && user.currentStreak > 0) {
      const lastUtc = new Date(user.lastStreakDate + 'T00:00:00Z');
      const span = Math.min(windowDays, user.currentStreak);
      for (let offset = 0; offset < span; offset++) {
        const dayStr = new Date(lastUtc.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
        if (windowSet.has(dayStr)) {
          activeDates.add(dayStr);
        }
      }
    }

    return windowDates.map((day) => (activeDates.has(day) ? 1 : 0));
  }
}
