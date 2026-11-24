import { Inject, Injectable, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import type { DrizzleExecutor } from '../../database/database.module';
import {
  friendStreakDays,
  friendStreaks,
  friendships,
  moderatedCategories,
  readings,
  userBlocks,
  userSettings,
} from '../../database/drizzle/schema';
import { getDateKeyInTimeZone } from '../subscriptions/subscriptions.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService, type UserWithRole } from '../users/users.service';
import { canonicalCategoryKey, cleanCategoryDisplayName } from '../moderation/category-normalizer';
import type {
  CreateFriendStreakDto,
  FriendStreakCategoriesDto,
  FriendStreakDto,
} from './dto/friendship.dto';
import { ReadingsService } from '../readings/readings.service';
import { AppConfigService } from '../../config/env.config';
import { AuditLogService, ErrorLogService } from '../logs';
import { resolveActiveLanguages } from '../settings/language-selection.helpers';

const TZ = 'America/Mexico_City';

/** Orquesta la configuración, avance y generación diaria de rachas privadas. */
@Injectable()
export class FriendStreakService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly users: UsersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly readings: ReadingsService,
    @Optional() private readonly config?: AppConfigService,
    @Optional() private readonly scheduler?: SchedulerRegistry,
    @Optional() private readonly auditLogs?: AuditLogService,
    @Optional() private readonly errorLogs?: ErrorLogService,
  ) {}

  onModuleInit(): void {
    const expression = this.config?.friendStreak.expression ?? '0 6 * * *';
    const retryExpression = this.config?.friendStreak.retryExpression ?? '*/15 6-23 * * *';
    if (!this.config?.friendStreak.enabled || !this.scheduler) return;
    if (!this.scheduler.doesExist('cron', 'friend-streak-daily')) {
      this.scheduler.addCronJob(
        'friend-streak-daily',
        CronJob.from({
          cronTime: expression,
          onTick: () => void this.runDaily(),
          timeZone: TZ,
          start: true,
          name: 'friend-streak-daily',
        }),
      );
    }
    if (!this.scheduler.doesExist('cron', 'friend-streak-retry')) {
      this.scheduler.addCronJob(
        'friend-streak-retry',
        CronJob.from({
          cronTime: retryExpression,
          onTick: () => void this.runDaily(),
          timeZone: TZ,
          start: true,
          name: 'friend-streak-retry',
        }),
      );
    }
  }

  private async eligible(id: number): Promise<UserWithRole> {
    const user = await this.users.findById(id);
    if (user?.role !== 'student' || user?.deletedAt || !user?.emailVerifiedAt) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN);
    }
    await this.subscriptions.assertSubscriptionActive(id);
    return user;
  }

  private pair(a: number, b: number): [number, number] {
    return a < b ? [a, b] : [b, a];
  }

  private async friendship(a: number, b: number): Promise<{ id: number }> {
    const rows = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(
            and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
            and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
          ),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    const blocked = await this.db
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
          and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
        ),
      )
      .limit(1);
    if (blocked[0]) throw new AppHttpException(ErrorCode.FRIENDSHIP_USER_BLOCKED);
    return rows[0];
  }

  private clean(input: readonly string[]): string[] {
    const map = new Map<string, string>();
    for (const value of input) {
      const display = cleanCategoryDisplayName(value);
      const key = canonicalCategoryKey(display);
      if (key) map.set(key, display);
    }
    return [...map.values()];
  }

  private async approved(input: readonly string[]): Promise<string[]> {
    const values = this.clean(input);
    if (values.length !== 2) throw new AppHttpException(ErrorCode.FRIEND_STREAK_CATEGORIES_INVALID);
    const keys = values.map(canonicalCategoryKey);
    const rows = await this.db
      .select({ key: moderatedCategories.canonicalKey })
      .from(moderatedCategories)
      .where(
        and(inArray(moderatedCategories.canonicalKey, keys), eq(moderatedCategories.allowed, true)),
      );
    if (rows.length !== 2) throw new AppHttpException(ErrorCode.FRIEND_STREAK_CATEGORIES_INVALID);
    return values;
  }

  private async library(id: number): Promise<string[]> {
    const rows = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, id))
      .limit(1);
    const row = rows[0];
    return this.clean([...(row?.savedCategories ?? []), ...(row?.preferredCategories ?? [])]);
  }

  private async validateCategories(id: number, requested: string[]): Promise<string[]> {
    const library = new Set((await this.library(id)).map(canonicalCategoryKey));
    const approved = await this.approved(requested);
    if (approved.some((value) => !library.has(canonicalCategoryKey(value)))) {
      throw new AppHttpException(ErrorCode.FRIEND_STREAK_CATEGORIES_INVALID);
    }
    return approved;
  }

  async create(
    userId: number,
    friendUserId: number,
    dto: CreateFriendStreakDto,
  ): Promise<FriendStreakDto> {
    await this.eligible(userId);
    await this.eligible(friendUserId);
    if (userId === friendUserId)
      throw new AppHttpException(ErrorCode.FRIENDSHIP_SELF_ACTION_NOT_ALLOWED);
    const friendship = await this.friendship(userId, friendUserId);
    const my = await this.validateCategories(userId, dto.categories);
    const partner = await this.validateCategories(friendUserId, dto.friendCategories);
    const [low, high] = this.pair(userId, friendUserId);
    const activeLanguages = await Promise.all(
      [userId, friendUserId].map(async (id) => {
        const sub = await this.subscriptions.getUserSubscription(id);
        const settingsRows = await this.db
          .select({ selectedLanguages: userSettings.selectedLanguages })
          .from(userSettings)
          .where(eq(userSettings.userId, id))
          .limit(1);
        return sub.plan
          ? resolveActiveLanguages(
              (settingsRows[0]?.selectedLanguages ?? []) as ('es' | 'en' | 'fr' | 'it')[],
              sub.plan.maxLanguages,
            )
          : [];
      }),
    );
    if (!activeLanguages.every((languages) => languages.includes(dto.language as never))) {
      throw new AppHttpException(ErrorCode.FRIEND_STREAK_LANGUAGE_INCOMPATIBLE);
    }
    const rows = await this.db
      .insert(friendStreaks)
      .values({
        friendshipId: friendship.id,
        userLowId: low,
        userHighId: high,
        initiatedByUserId: userId,
        userLowCategories: low === userId ? my : partner,
        userHighCategories: high === userId ? my : partner,
        language: dto.language,
        difficulty: dto.difficulty ?? 'medium',
        size: dto.size ?? 'medium',
      })
      .returning();
    if (!rows[0]) throw new Error('Friend streak insert returned no row');
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friend_streak.created',
      entityType: 'friend_streaks',
      entityId: rows[0].id,
      actorUserId: userId,
      targetUserId: friendUserId,
      summary: `Friend streak #${rows[0].id} created`,
    });
    return this.toDto(rows[0], userId, null);
  }

  async accept(userId: number, id: number): Promise<FriendStreakDto> {
    await this.eligible(userId);
    const rows = await this.db
      .update(friendStreaks)
      .set({ status: 'active', startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(friendStreaks.id, id),
          or(eq(friendStreaks.userLowId, userId), eq(friendStreaks.userHighId, userId)),
          eq(friendStreaks.status, 'pending_partner'),
        ),
      )
      .returning();
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIEND_STREAK_INVALID_STATE);
    return this.toDto(rows[0], userId, null);
  }

  async reject(userId: number, id: number): Promise<void> {
    await this.eligible(userId);
    const rows = await this.db
      .update(friendStreaks)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(
        and(
          eq(friendStreaks.id, id),
          or(eq(friendStreaks.userLowId, userId), eq(friendStreaks.userHighId, userId)),
          eq(friendStreaks.status, 'pending_partner'),
        ),
      )
      .returning({ id: friendStreaks.id });
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIEND_STREAK_INVALID_STATE);
  }

  async updateCategories(
    userId: number,
    id: number,
    dto: FriendStreakCategoriesDto,
  ): Promise<FriendStreakDto> {
    await this.eligible(userId);
    const rows = await this.db
      .select()
      .from(friendStreaks)
      .where(
        and(
          eq(friendStreaks.id, id),
          or(eq(friendStreaks.userLowId, userId), eq(friendStreaks.userHighId, userId)),
          inArray(friendStreaks.status, ['pending_partner', 'active', 'paused']),
        ),
      )
      .limit(1);
    const streak = rows[0];
    if (!streak) throw new AppHttpException(ErrorCode.FRIEND_STREAK_INVALID_STATE);
    const categories = await this.validateCategories(userId, dto.categories);
    const set =
      streak.userLowId === userId
        ? { userLowCategories: categories, updatedAt: new Date() }
        : { userHighCategories: categories, updatedAt: new Date() };
    const updated = await this.db
      .update(friendStreaks)
      .set(set)
      .where(eq(friendStreaks.id, id))
      .returning();
    const row = updated[0];
    if (!row) throw new AppHttpException(ErrorCode.FRIEND_STREAK_INVALID_STATE);
    return this.toDto(row, userId, null);
  }

  async end(userId: number, id: number): Promise<void> {
    await this.eligible(userId);
    const rows = await this.db
      .update(friendStreaks)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(
        and(
          eq(friendStreaks.id, id),
          or(eq(friendStreaks.userLowId, userId), eq(friendStreaks.userHighId, userId)),
          inArray(friendStreaks.status, ['pending_partner', 'active', 'paused']),
        ),
      )
      .returning({ id: friendStreaks.id });
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIEND_STREAK_INVALID_STATE);
  }

  async list(userId: number): Promise<FriendStreakDto[]> {
    await this.eligible(userId);
    const rows = await this.db
      .select()
      .from(friendStreaks)
      .where(or(eq(friendStreaks.userLowId, userId), eq(friendStreaks.userHighId, userId)))
      .orderBy(desc(friendStreaks.updatedAt));
    return Promise.all(
      rows.map((row) => this.currentDay(row.id).then((day) => this.toDto(row, userId, day))),
    );
  }

  async get(userId: number, id: number): Promise<FriendStreakDto> {
    await this.eligible(userId);
    const rows = await this.db
      .select()
      .from(friendStreaks)
      .where(
        and(
          eq(friendStreaks.id, id),
          or(eq(friendStreaks.userLowId, userId), eq(friendStreaks.userHighId, userId)),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIEND_STREAK_INVALID_STATE);
    return this.toDto(rows[0], userId, await this.currentDay(id));
  }

  private async currentDay(id: number): Promise<typeof friendStreakDays.$inferSelect | null> {
    return (
      (
        await this.db
          .select()
          .from(friendStreakDays)
          .where(
            and(
              eq(friendStreakDays.streakId, id),
              eq(friendStreakDays.streakDate, getDateKeyInTimeZone(TZ)),
            ),
          )
          .limit(1)
      )[0] ?? null
    );
  }

  private toDto(
    row: typeof friendStreaks.$inferSelect,
    userId: number,
    day: typeof friendStreakDays.$inferSelect | null,
  ): FriendStreakDto {
    const mineLow = row.userLowId === userId;
    return {
      id: row.id,
      status: row.status,
      myCategories: mineLow ? row.userLowCategories : row.userHighCategories,
      partnerCategories: mineLow ? row.userHighCategories : row.userLowCategories,
      language: row.language,
      difficulty: row.difficulty,
      size: row.size,
      currentStreak: row.currentStreak,
      longestStreak: row.longestStreak,
      lastCompletedDate: row.lastCompletedDate,
      myCompletedToday: Boolean(
        day && (mineLow ? day.userLowCompletedAt : day.userHighCompletedAt),
      ),
      partnerCompletedToday: Boolean(
        day && (mineLow ? day.userHighCompletedAt : day.userLowCompletedAt),
      ),
      friendUserId: mineLow ? row.userHighId : row.userLowId,
    };
  }

  /** Ejecuta el cierre y la generación según la expresión configurada, en la zona de negocio. */
  async runDaily(): Promise<void> {
    if (this.config && !this.config.friendStreak.enabled) return;
    let acquired = false;
    await this.db.transaction(async (tx) => {
      const lock = await tx.execute(sql`SELECT pg_try_advisory_lock(1890611) AS locked`);
      if (!(lock.rows[0] as { locked?: boolean })?.locked) return;
      acquired = true;
      try {
        await this.closeYesterday(tx);
        await this.prepareToday(tx);
      } finally {
        // Advisory locks are connection-scoped; release on this same transaction client.
        await tx.execute(sql`SELECT pg_advisory_unlock(1890611)`);
      }
    });
    // AI calls and partner-row writes happen after the coordination transaction
    // has committed, so the advisory lock is never held across network I/O.
    if (acquired) await this.generateToday();
  }

  private async closeYesterday(db: DrizzleExecutor = this.db): Promise<void> {
    const yesterday = getDateKeyInTimeZone(TZ, new Date(Date.now() - 86_400_000));
    const days = await db
      .select()
      .from(friendStreakDays)
      .where(
        and(
          eq(friendStreakDays.streakDate, yesterday),
          inArray(friendStreakDays.status, ['pending', 'generation_failed']),
        ),
      );
    for (const day of days) {
      if (!day.userLowCompletedAt || !day.userHighCompletedAt) {
        await db
          .update(friendStreakDays)
          .set({ status: 'missed', updatedAt: new Date() })
          .where(eq(friendStreakDays.id, day.id));
        await db
          .update(friendStreaks)
          .set({ currentStreak: 0, updatedAt: new Date() })
          .where(eq(friendStreaks.id, day.streakId));
      }
    }
  }

  private async prepareToday(db: DrizzleExecutor): Promise<void> {
    const today = getDateKeyInTimeZone(TZ);
    const rows = await db.select().from(friendStreaks).where(eq(friendStreaks.status, 'active'));
    for (const streak of rows) {
      const existing = await db
        .select({ id: friendStreakDays.id })
        .from(friendStreakDays)
        .where(
          and(eq(friendStreakDays.streakId, streak.id), eq(friendStreakDays.streakDate, today)),
        )
        .limit(1);
      if (existing[0]) continue;
      const pool = this.clean([...streak.userLowCategories, ...streak.userHighCategories]);
      await db
        .insert(friendStreakDays)
        .values({
          streakId: streak.id,
          streakDate: today,
          selectedCategory: this.categoryForDay(undefined, pool),
        })
        .onConflictDoNothing();
    }
  }

  private async generateToday(db: DrizzleExecutor = this.db): Promise<void> {
    const today = getDateKeyInTimeZone(TZ);
    const rows = await db.select().from(friendStreaks).where(eq(friendStreaks.status, 'active'));
    for (const streak of rows) {
      const exists = await db
        .select()
        .from(friendStreakDays)
        .where(
          and(eq(friendStreakDays.streakId, streak.id), eq(friendStreakDays.streakDate, today)),
        )
        .limit(1);
      if (!exists[0] || exists[0].status === 'completed' || exists[0].status === 'missed') continue;
      const existingPair = await this.dayReadings(
        db,
        exists[0].id,
        streak.userLowId,
        streak.userHighId,
      );
      if (existingPair.low && existingPair.high) {
        await this.reconcileDay(exists[0], existingPair.low, existingPair.high);
        continue;
      }
      const claimed = await this.claimGenerationDay(exists[0]);
      if (!claimed) continue;
      const pool = this.clean([...streak.userLowCategories, ...streak.userHighCategories]);
      const category = this.categoryForDay(claimed, pool);
      const day = claimed;
      if (!day) continue;
      try {
        let source =
          existingPair.low ?? (await this.sourceReadingForDay(db, day.id, streak.userLowId));
        source ??= await this.readings.generateFriendStreakReading({
          userId: streak.userLowId,
          category,
          language: streak.language,
          difficulty: streak.difficulty,
          size: streak.size,
          friendStreakDayId: day.id,
        });
        await db
          .update(readings)
          .set({ friendStreakDayId: day.id })
          .where(eq(readings.id, source.id));
        let partner =
          existingPair.high ?? (await this.partnerReadingForDay(db, day.id, streak.userHighId));
        partner ??= (
          await db
            .insert(readings)
            .values({
              userId: streak.userHighId,
              originType: 'friend_streak',
              friendStreakDayId: day.id,
              title: source.title,
              description: source.description,
              content: source.content,
              category: source.category,
              difficulty: source.difficulty,
              language: source.language,
              wordCount: source.wordCount,
              status: 'pending',
              createdAt: new Date(),
            })
            .returning({ id: readings.id, status: readings.status })
        )[0];
        if (!partner) throw new Error('Friend streak partner reading insert returned no row');
        await db
          .update(friendStreakDays)
          .set({
            status: 'pending',
            userLowReadingId: source.id,
            userHighReadingId: partner.id,
            updatedAt: new Date(),
          })
          .where(eq(friendStreakDays.id, day.id));
      } catch (error) {
        await db
          .update(friendStreakDays)
          .set({
            status: 'generation_failed',
            errorMessage:
              error instanceof Error ? error.message.slice(0, 500) : 'generation failed',
            updatedAt: new Date(),
          })
          .where(eq(friendStreakDays.id, day.id));
        await this.errorLogs?.logError({
          severity: 'error',
          source: 'internal',
          module: 'friendships',
          errorCode: 'FRIEND_STREAK_GENERATION_FAILED',
          httpStatus: 500,
          message: error instanceof Error ? error.message : 'Friend streak generation failed',
          details: { streakId: streak.id, dayId: day.id },
        });
      }
    }
  }

  /** Reserva un día con una escritura condicional antes de iniciar la llamada externa a IA. */
  private async claimGenerationDay(
    day: typeof friendStreakDays.$inferSelect,
  ): Promise<typeof friendStreakDays.$inferSelect | null> {
    const markerPrefix = '__friend_streak_generating__:';
    const stale = day.errorMessage?.startsWith(markerPrefix)
      ? Date.now() - Date.parse(day.errorMessage.slice(markerPrefix.length)) > 15 * 60_000
      : false;
    if (day.status === 'pending' && day.errorMessage && !stale) return null;
    const previousError = day.errorMessage;
    const marker = `${markerPrefix}${new Date().toISOString()}`;
    const rows = await this.db.transaction(async (tx) =>
      tx
        .update(friendStreakDays)
        .set({ status: 'pending', errorMessage: marker, updatedAt: new Date() })
        .where(
          and(
            eq(friendStreakDays.id, day.id),
            inArray(friendStreakDays.status, ['pending', 'generation_failed']),
            previousError === null
              ? isNull(friendStreakDays.errorMessage)
              : eq(friendStreakDays.errorMessage, previousError),
          ),
        )
        .returning(),
    );
    return rows[0] ?? null;
  }

  /** Busca exclusivamente la lectura vinculada al día, usuario y origen exactos. */
  private async sourceReadingForDay(
    db: DrizzleExecutor,
    dayId: number,
    userId: number,
  ): Promise<typeof readings.$inferSelect | undefined> {
    const rows = await db
      .select()
      .from(readings)
      .where(
        and(
          eq(readings.friendStreakDayId, dayId),
          eq(readings.userId, userId),
          eq(readings.originType, 'friend_streak'),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private async partnerReadingForDay(
    db: DrizzleExecutor,
    dayId: number,
    userId: number,
  ): Promise<Pick<typeof readings.$inferSelect, 'id' | 'status'> | undefined> {
    const rows = await db
      .select({ id: readings.id, status: readings.status })
      .from(readings)
      .where(
        and(
          eq(readings.friendStreakDayId, dayId),
          eq(readings.userId, userId),
          eq(readings.originType, 'friend_streak'),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private async dayReadings(
    db: DrizzleExecutor,
    dayId: number,
    lowUserId: number,
    highUserId: number,
  ): Promise<{
    low: typeof readings.$inferSelect | undefined;
    high: Pick<typeof readings.$inferSelect, 'id' | 'status'> | undefined;
  }> {
    return {
      low: await this.sourceReadingForDay(db, dayId, lowUserId),
      high: await this.partnerReadingForDay(db, dayId, highUserId),
    };
  }

  private async reconcileDay(
    day: typeof friendStreakDays.$inferSelect,
    low: typeof readings.$inferSelect,
    high: Pick<typeof readings.$inferSelect, 'id' | 'status'>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const lockedDays = await tx
        .select()
        .from(friendStreakDays)
        .where(eq(friendStreakDays.id, day.id))
        .for('update');
      const lockedDay = lockedDays[0];
      if (!lockedDay) return;

      // A completed day is the idempotency guard: a retry must not increment twice.
      if (lockedDay.status === 'completed') {
        await tx
          .update(friendStreakDays)
          .set({
            userLowReadingId: low.id,
            userHighReadingId: high.id,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(friendStreakDays.id, lockedDay.id));
        return;
      }

      const bothCompleted = low.status === 'completed' && high.status === 'completed';
      if (!bothCompleted) {
        const now = new Date();
        await tx
          .update(friendStreakDays)
          .set({
            userLowReadingId: low.id,
            userHighReadingId: high.id,
            userLowCompletedAt:
              low.status === 'completed'
                ? (lockedDay.userLowCompletedAt ?? now)
                : lockedDay.userLowCompletedAt,
            userHighCompletedAt:
              high.status === 'completed'
                ? (lockedDay.userHighCompletedAt ?? now)
                : lockedDay.userHighCompletedAt,
            errorMessage: null,
            status: 'pending',
            updatedAt: new Date(),
          })
          .where(eq(friendStreakDays.id, lockedDay.id));
        return;
      }

      const lockedStreaks = await tx
        .select()
        .from(friendStreaks)
        .where(eq(friendStreaks.id, lockedDay.streakId))
        .for('update');
      const lockedStreak = lockedStreaks[0];
      if (!lockedStreak) return;

      const now = new Date();
      const nextCurrent = lockedStreak.currentStreak + 1;
      await tx
        .update(friendStreakDays)
        .set({
          userLowReadingId: low.id,
          userHighReadingId: high.id,
          userLowCompletedAt: lockedDay.userLowCompletedAt ?? now,
          userHighCompletedAt: lockedDay.userHighCompletedAt ?? now,
          errorMessage: null,
          status: 'completed',
          updatedAt: now,
        })
        .where(eq(friendStreakDays.id, lockedDay.id));
      await tx
        .update(friendStreaks)
        .set({
          currentStreak: nextCurrent,
          longestStreak: Math.max(nextCurrent, lockedStreak.longestStreak),
          lastCompletedDate: lockedDay.streakDate,
          updatedAt: now,
        })
        .where(eq(friendStreaks.id, lockedStreak.id));
    });
  }

  /** Conserva la categoría persistida cuando un día generation_failed se reintenta. */
  private categoryForDay(
    existing: { selectedCategory?: string } | undefined,
    pool: readonly string[],
  ): string {
    return existing?.selectedCategory ?? pool[Math.floor(Math.random() * pool.length)];
  }
}
