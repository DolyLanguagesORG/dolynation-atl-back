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
 * Esquema Drizzle para la base de datos de Dolynglish.
 *
 * IMPORTANTE: Este archivo DEBE reflejar exactamente el esquema aplicado por
 * `infrastructure/database/postgres/01-init.sql`. El backend NO ejecuta
 * migraciones; el repositorio de infraestructura administra el ciclo de vida DDL.
 * Drizzle se usa aquí como constructor tipado de consultas.
 *
 * Si agregas una columna aquí, agrégala también a la migración SQL en infraestructura.
 */

/** Tabla principal de cuentas de usuario, plan de suscripción y racha de actividad. */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    fullName: varchar('full_name', { length: 255 }),
    email: varchar('email', { length: 254 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(),
    subscriptionTier: varchar('subscription_tier', { length: 30 }),
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

/**
 * Preferencias de estudio por usuario (idiomas ordenados por prioridad, bloqueo
 * de cambio anual, créditos de cambio de idioma y categorías seleccionadas).
 *
 * NOTA: Esta tabla requiere su `CREATE TABLE` / `ALTER TABLE` correspondiente en
 * `dolynation-tlalli-infra/database/postgres/01-init.sql` y `updates/08-language-plans.sql`.
 */
export const userSettings = pgTable('user_settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  preferredLanguage: varchar('preferred_language', { length: 10 }),
  selectedLanguages: jsonb('selected_languages').$type<string[]>().notNull().default([]),
  lastLanguageChangeAt: timestamp('last_language_change_at', { withTimezone: false }),
  languageChangeCredits: integer('language_change_credits').notNull().default(0),
  preferredCategories: jsonb('preferred_categories').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }),
});

/**
 * Membresía de administradores — una fila por usuario con privilegios de administrador.
 * Se mantiene como tabla separada (y no como columna en `users`) para no afectar
 * las consultas `SELECT` existentes sobre `users` hasta que aterrice la migración en infra.
 */
export const admins = pgTable('admins', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: false }).notNull().defaultNow(),
});

/** Tokens de sesión persistidos (actualmente usado para el hash de refresh tokens y su revocación). */
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

/** Lecturas generadas por IA junto con su estado, contenido y resultado de evaluación. */
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

/** Bitácora de auditoría para eventos de generación de prompts, errores de IA y eventos de auth. */
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

/** Preguntas y explicaciones de vocabulario solicitadas sobre una lectura específica. */
export const readingExplanations = pgTable(
  'reading_explanations',
  {
    id: serial('id').primaryKey(),
    readingId: integer('reading_id')
      .notNull()
      .references(() => readings.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    word: varchar('word', { length: 255 }).notNull(),
    context: text('context'),
    explanation: text('explanation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    readingIdIdx: index('idx_reading_explanations_reading_id').on(table.readingId),
    userCreatedIdx: index('idx_reading_explanations_user_created').on(
      table.userId,
      table.createdAt,
    ),
    createdAtIdx: index('idx_reading_explanations_created_at').on(table.createdAt),
  }),
);

/** Mapa completo de tablas exportadas para consultas relacionales de Drizzle. */

export const schema = {
  users,
  userSettings,
  admins,
  authAccessTokens,
  readings,
  readingExplanations,
  promptLogs,
};
