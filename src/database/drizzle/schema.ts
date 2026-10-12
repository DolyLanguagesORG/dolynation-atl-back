import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  date,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Schema for the dolynglish database.
 *
 * IMPORTANT: This file MUST mirror the schema applied by
 * `infrastructure/database/postgres/01-init.sql`. The backend does NOT run migrations
 * — infrastructure owns the schema lifecycle. Drizzle here is used as a typed
 * query builder and for runtime introspection, not for DDL.
 *
 * If you add a column here, also add it to the init.sql migration in infrastructure/.
 */

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    fullName: varchar('full_name', { length: 255 }),
    email: varchar('email', { length: 254 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(),
    currentStreak: integer('current_streak').notNull().default(0),
    lastStreakDate: date('last_streak_date'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }),
    deletedAt: timestamp('deleted_at', { withTimezone: false }),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export const authAccessTokens = pgTable('auth_access_tokens', {
  id: serial('id').primaryKey(),
  tokenableId: integer('tokenable_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  hash: varchar('hash', { length: 255 }).notNull(),
  abilities: text('abilities').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }),
  updatedAt: timestamp('updated_at', { withTimezone: false }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: false }),
  expiresAt: timestamp('expires_at', { withTimezone: false }),
  deletedAt: timestamp('deleted_at', { withTimezone: false }),
});

export const readings = pgTable(
  'readings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    content: text('content').notNull(),
    category: varchar('category', { length: 50 }).notNull().default('technology'),
    difficulty: varchar('difficulty', { length: 20 }).notNull().default('medium'),
    wordCount: integer('word_count').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    score: integer('score'),
    passed: boolean('passed'),
    userResponse: text('user_response'),
    feedback: text('feedback'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }),
    deletedAt: timestamp('deleted_at', { withTimezone: false }),
  },
  (table) => ({
    userIdIdx: index('idx_readings_user_id').on(table.userId),
    statusIdx: index('idx_readings_status').on(table.status),
  }),
);

export const promptLogs = pgTable(
  'prompt_logs',
  {
    id: serial('id').primaryKey(),
    level: varchar('level', { length: 20 }).notNull(),
    event: varchar('event', { length: 100 }).notNull(),
    message: text('message').notNull(),
    seed: varchar('seed', { length: 255 }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    textId: integer('text_id').references(() => readings.id, { onDelete: 'set null' }),
    params: jsonb('params'),
    systemPrompt: text('system_prompt'),
    userPrompt: text('user_prompt'),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    levelIdx: index('idx_prompt_logs_level').on(table.level),
    eventIdx: index('idx_prompt_logs_event').on(table.event),
    seedIdx: index('idx_prompt_logs_seed').on(table.seed),
    userIdIdx: index('idx_prompt_logs_user_id').on(table.userId),
    createdAtIdx: index('idx_prompt_logs_created_at').on(table.createdAt),
  }),
);

export const schema = { users, authAccessTokens, readings, promptLogs };
