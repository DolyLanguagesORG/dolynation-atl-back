import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { users } from '../../database/drizzle/schema';
import { eq } from 'drizzle-orm';
import { type NewUser, type User } from '../../database/drizzle/types';
import * as argon2 from 'argon2';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';

export interface UpdateProfileInput {
  fullName?: string;
}

export interface PublicUser {
  id: number;
  email: string;
  fullName: string | null;
  currentStreak: number;
  lastStreakDate: string | null;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: { email: string; password: string; fullName: string }): Promise<User> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const now = new Date();
    const row: NewUser = {
      email: input.email,
      password: passwordHash,
      currentStreak: 0,
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

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      currentStreak: user.currentStreak,
      lastStreakDate: user.lastStreakDate,
      createdAt: user.createdAt,
    };
  }

  /**
   * Compute the current streak for a user. Pure: does not write to DB.
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
   * Return the authenticated user's profile. Throws RESOURCE_NOT_FOUND if the
   * row was deleted between token issue and the request.
   */
  async getProfile(userId: number): Promise<PublicUser> {
    const user = await this.findById(userId);
    if (!user) throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND);
    return this.toPublic(user);
  }

  /**
   * Update mutable profile fields. Only `fullName` is accepted; email and
   * password are mutated through dedicated flows (not implemented here).
   * No-op PATCHes are allowed and just return the current row.
   */
  async updateProfile(userId: number, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await this.findById(userId);
    if (!user) throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND);

    const patch: { fullName?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (input.fullName !== undefined) {
      patch.fullName = input.fullName.trim();
    }

    if (patch.fullName === undefined) {
      return this.toPublic(user);
    }

    const [updated] = await this.db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND);
    return this.toPublic(updated);
  }

  async activeStreakFor(_userId: number, days = 7): Promise<number[]> {
    const result = Array.from({ length: days }, () => 1);
    await Promise.resolve(result);
    return result;
  }
}
