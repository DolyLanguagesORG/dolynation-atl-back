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
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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

/** Catálogo de roles del sistema (`student`, `admin`). */
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 30 }).notNull().unique(),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
});

/** Tabla principal de cuentas de usuario, rol, plan de suscripción y racha de actividad. */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    fullName: varchar('full_name', { length: 255 }),
    email: varchar('email', { length: 254 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(),
    roleId: integer('role_id')
      .notNull()
      .default(1)
      .references(() => roles.id),
    subscriptionTier: varchar('subscription_tier', { length: 30 }),
    currentStreak: integer('current_streak').notNull().default(0),
    lastStreakDate: date('last_streak_date'),
    /**
     * Marca de verificación del correo. `null` = la cuenta todavía no confirmó
     * su correo. Solo es obligatorio cuando `EMAIL_VERIFICATION_REQUIRED` está activo.
     */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: false }),
    /**
     * Locale de interfaz del usuario (`es` | `en`) usado para elegir el idioma
     * de los correos transaccionales. **No** es el idioma de estudio, que vive
     * en `user_settings.selected_languages`.
     */
    locale: varchar('locale', { length: 10 }).notNull().default('es'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }),
    deletedAt: timestamp('deleted_at', { withTimezone: false }),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
    roleIdIdx: index('idx_users_role_id').on(table.roleId),
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
  savedCategories: jsonb('saved_categories').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }),
});

/** Tipo de solicitud de acceso enviada para aprobación administrativa. */
export type AccessRequestType = 'subscription' | 'language_unlock';

/** Estado del ciclo de vida de una solicitud de acceso. */
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * Solicitudes de acceso a planes de suscripción o desbloqueo de cambio de idioma
 * enviadas por usuarios verificados cuando `ACCESS_REQUESTS_ENABLED=true`.
 */
export const accessRequests = pgTable(
  'access_requests',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestType: varchar('request_type', { length: 30 }).$type<AccessRequestType>().notNull(),
    requestedTier: varchar('requested_tier', { length: 30 }),
    currentTier: varchar('current_tier', { length: 30 }),
    userMessage: text('user_message'),
    status: varchar('status', { length: 20 })
      .$type<AccessRequestStatus>()
      .notNull()
      .default('pending'),
    rejectionReason: text('rejection_reason'),
    reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_access_requests_user_id').on(table.userId),
    statusIdx: index('idx_access_requests_status').on(table.status),
    userTypeStatusIdx: index('idx_access_requests_user_type_status').on(
      table.userId,
      table.requestType,
      table.status,
    ),
    pendingUnique: uniqueIndex('uq_access_requests_pending_per_user_type')
      .on(table.userId, table.requestType)
      .where(sql`status = 'pending'`),
  }),
);

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

/**
 * Tokens de un solo uso para confirmar el correo de la cuenta y para restablecer
 * la contraseña. Se persiste únicamente el hash SHA-256 del token: el valor en
 * claro solo viaja dentro del enlace del correo y nunca se almacena.
 */
export const authEmailTokens = pgTable(
  'auth_email_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 30 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: false }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull(),
  },
  (table) => ({
    hashUnique: uniqueIndex('uq_auth_email_tokens_hash').on(table.tokenHash),
    userTypeIndex: index('idx_auth_email_tokens_user_type').on(table.userId, table.type),
  }),
);

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
    language: varchar('language', { length: 10 }).notNull().default('en'),
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
    requestId: varchar('request_id', { length: 64 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    provider: varchar('provider', { length: 30 }),
    model: varchar('model', { length: 60 }),
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
    requestIdIdx: index('idx_prompt_logs_request_id').on(table.requestId),
    createdAtIdx: index('idx_prompt_logs_created_at').on(table.createdAt),
  }),
);

/** Clasificación del término o expresión consultada en una lectura. */
export type ExplanationEntryType = 'word' | 'phrase';

/** Elemento del desglose palabra por palabra de una consulta contextual. */
export interface WordBreakdownItem {
  token: string;
  lemma: string;
  partOfSpeech: string;
  literalDefinition: string;
  roleInPhrase?: string;
}

/** Forma alternativa o sinónimo contextual en el idioma objetivo. */
export interface AlternativeExpressionItem {
  expression: string;
  register?: string;
  note: string;
}

/** Otro contexto real donde se emplea la misma palabra o expresión. */
export interface UsageContextItem {
  contextLabel: string;
  explanation: string;
  example: string;
}

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
    word: text('word').notNull(),
    normalizedWord: text('normalized_word').notNull().default(''),
    entryType: varchar('entry_type', { length: 20 })
      .$type<ExplanationEntryType>()
      .notNull()
      .default('word'),
    language: varchar('language', { length: 10 }).notNull().default('en'),
    difficulty: varchar('difficulty', { length: 20 }).notNull().default('medium'),
    context: text('context'),
    literalMeaning: text('literal_meaning'),
    explanation: text('explanation').notNull(),
    wordBreakdown: jsonb('word_breakdown').$type<WordBreakdownItem[]>().notNull().default([]),
    otherWaysToSay: jsonb('other_ways_to_say')
      .$type<AlternativeExpressionItem[]>()
      .notNull()
      .default([]),
    otherContexts: jsonb('other_contexts').$type<UsageContextItem[]>().notNull().default([]),
    isSaved: boolean('is_saved').notNull().default(false),
    savedAt: timestamp('saved_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    readingIdIdx: index('idx_reading_explanations_reading_id').on(table.readingId),
    userCreatedIdx: index('idx_reading_explanations_user_created').on(
      table.userId,
      table.createdAt,
    ),
    createdAtIdx: index('idx_reading_explanations_created_at').on(table.createdAt),
    lookupIdx: index('idx_reading_explanations_lookup').on(
      table.userId,
      table.readingId,
      table.normalizedWord,
    ),
    glossaryIdx: index('idx_reading_explanations_glossary').on(
      table.userId,
      table.isSaved,
      table.language,
      table.entryType,
      table.createdAt,
    ),
  }),
);

/** Blueprint editorial reutilizable de una categoría personalizada para evitar llamadas repetidas en cada lectura. */
export interface CategoryPromptProfile {
  displayName: string;
  editorialGuidance: string;
  subtopics: string[];
  uniqueFocusAngles: string[];
  coreConcepts: string[];
  generatedAt: string;
}

/** Caché interna persistente de categorías evaluadas por moderación automática/IA y su biblioteca de prompts (no expuesta como catálogo global entre usuarios). */
export const moderatedCategories = pgTable(
  'moderated_categories',
  {
    canonicalKey: varchar('canonical_key', { length: 120 }).primaryKey(),
    sampleCategory: varchar('sample_category', { length: 100 }).notNull(),
    allowed: boolean('allowed').notNull(),
    layer: varchar('layer', { length: 30 }),
    reason: varchar('reason', { length: 120 }),
    provider: varchar('provider', { length: 30 }).notNull().default('system'),
    promptProfile: jsonb('prompt_profile').$type<CategoryPromptProfile | null>(),
    profileModel: varchar('profile_model', { length: 60 }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    providerIdx: index('idx_moderated_categories_provider').on(table.provider),
  }),
);

/** Registro diario de categorías dinámicas distintas evaluadas por usuario para evitar abuso en bucle. */
export const categoryDailyUsage = pgTable(
  'category_daily_usage',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    usageDate: varchar('usage_date', { length: 10 }).notNull(),
    canonicalKey: varchar('canonical_key', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    userDayKeyUnique: unique('uq_category_daily_usage_user_day_key').on(
      table.userId,
      table.usageDate,
      table.canonicalKey,
    ),
  }),
);

/** Acción auditada registrada en `audit_logs`. */
export type AuditLogAction =
  'CREATE' | 'UPDATE' | 'SOFT_DELETE' | 'DELETE' | 'AUTH' | 'ACTION' | 'MAIL' | 'MODERATION' | 'AI';

/** Severidad registrada en `error_logs`. */
export type ErrorLogSeverity = 'warn' | 'error' | 'fatal';

/** Bitácora integral de auditoría de operaciones, cambios CRUD before/after y eventos de negocio. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    requestId: varchar('request_id', { length: 64 }),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: varchar('actor_email', { length: 254 }),
    actorRole: varchar('actor_role', { length: 30 }),
    targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    httpMethod: varchar('http_method', { length: 10 }),
    httpPath: varchar('http_path', { length: 500 }),
    httpStatus: integer('http_status'),
    module: varchar('module', { length: 50 }).notNull(),
    action: varchar('action', { length: 30 }).$type<AuditLogAction>().notNull(),
    event: varchar('event', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }),
    entityId: varchar('entity_id', { length: 120 }),
    summary: text('summary').notNull(),
    beforeState: jsonb('before_state').$type<Record<string, unknown> | null>(),
    afterState: jsonb('after_state').$type<Record<string, unknown> | null>(),
    changedFields: jsonb('changed_fields').$type<string[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdIdx: index('idx_audit_logs_request_id').on(table.requestId),
    actorUserIdIdx: index('idx_audit_logs_actor_user_id').on(table.actorUserId),
    targetUserIdIdx: index('idx_audit_logs_target_user_id').on(table.targetUserId),
    moduleActionIdx: index('idx_audit_logs_module_action').on(table.module, table.action),
    eventIdx: index('idx_audit_logs_event').on(table.event),
    entityIdx: index('idx_audit_logs_entity').on(table.entityType, table.entityId),
    ipAddressIdx: index('idx_audit_logs_ip_address').on(table.ipAddress),
    createdAtIdx: index('idx_audit_logs_created_at').on(table.createdAt),
    actorCreatedIdx: index('idx_audit_logs_actor_created').on(table.actorUserId, table.createdAt),
  }),
);

/** Registro centralizado de fallos HTTP 4xx/5xx, excepciones no controladas, fallos SMTP, IA y moderación. */
export const errorLogs = pgTable(
  'error_logs',
  {
    id: serial('id').primaryKey(),
    requestId: varchar('request_id', { length: 64 }),
    severity: varchar('severity', { length: 20 })
      .$type<ErrorLogSeverity>()
      .notNull()
      .default('error'),
    source: varchar('source', { length: 40 }).notNull(),
    module: varchar('module', { length: 50 }),
    errorCode: varchar('error_code', { length: 80 }).notNull(),
    httpStatus: integer('http_status'),
    message: text('message').notNull(),
    errorName: varchar('error_name', { length: 120 }),
    errorStack: text('error_stack'),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: varchar('actor_email', { length: 254 }),
    actorRole: varchar('actor_role', { length: 30 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    httpMethod: varchar('http_method', { length: 10 }),
    httpPath: varchar('http_path', { length: 500 }),
    requestBody: jsonb('request_body').$type<Record<string, unknown> | null>(),
    requestQuery: jsonb('request_query').$type<Record<string, unknown> | null>(),
    details: jsonb('details').$type<Record<string, unknown> | null>(),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdIdx: index('idx_error_logs_request_id').on(table.requestId),
    severityIdx: index('idx_error_logs_severity').on(table.severity),
    sourceIdx: index('idx_error_logs_source').on(table.source),
    errorCodeIdx: index('idx_error_logs_error_code').on(table.errorCode),
    httpStatusIdx: index('idx_error_logs_http_status').on(table.httpStatus),
    actorUserIdIdx: index('idx_error_logs_actor_user_id').on(table.actorUserId),
    ipAddressIdx: index('idx_error_logs_ip_address').on(table.ipAddress),
    createdAtIdx: index('idx_error_logs_created_at').on(table.createdAt),
  }),
);

/** Mapa completo de tablas exportadas para consultas relacionales de Drizzle. */

export const schema = {
  roles,
  users,
  userSettings,
  authAccessTokens,
  authEmailTokens,
  accessRequests,
  readings,
  readingExplanations,
  promptLogs,
  moderatedCategories,
  categoryDailyUsage,
  auditLogs,
  errorLogs,
};
