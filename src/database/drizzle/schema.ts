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
  check,
  unique,
  uniqueIndex,
  type AnyPgColumn,
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
    password: varchar('password', { length: 255 }),
    roleId: integer('role_id')
      .notNull()
      .default(1)
      .references(() => roles.id),
    subscriptionTier: varchar('subscription_tier', { length: 30 }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 64 }),
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
    stripeCustomerIdUnique: uniqueIndex('uq_users_stripe_customer_id')
      .on(table.stripeCustomerId)
      .where(sql`stripe_customer_id IS NOT NULL`),
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
    originType: varchar('origin_type', { length: 20 })
      .$type<ReadingOriginType>()
      .notNull()
      .default('personal'),
    sourceReadingId: integer('source_reading_id').references((): AnyPgColumn => readings.id, {
      onDelete: 'set null',
    }),
    /** Se completa para las lecturas generadas por una racha; la FK vive en el SQL de infraestructura. */
    friendStreakDayId: integer('friend_streak_day_id').references(
      (): AnyPgColumn => friendStreakDays.id,
      { onDelete: 'set null' },
    ),
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
    // La clave de idempotencia de la evaluacion: la envia el cliente (la
    // app PWA la genera al encolar la respuesta sin conexion). Si la misma
    // operacion llega dos veces, la segunda devuelve la evaluacion ya hecha
    // en vez de error: sin esto, un envio reintentado evaluaria dos veces
    // (y la IA cobraria dos veces).
    evaluationOperationId: varchar('evaluation_operation_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }),
    deletedAt: timestamp('deleted_at', { withTimezone: false }),
  },
  (table) => ({
    userIdIdx: index('idx_readings_user_id').on(table.userId),
    statusIdx: index('idx_readings_status').on(table.status),
    sourceReadingUnique: uniqueIndex('uq_readings_user_source_reading')
      .on(table.userId, table.sourceReadingId)
      .where(sql`${table.sourceReadingId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    userOriginCreatedIdx: index('idx_readings_user_origin_created').on(
      table.userId,
      table.originType,
      table.createdAt,
    ),
    originTypeCheck: check(
      'readings_origin_type_check',
      sql`${table.originType} IN ('personal', 'friend_copy', 'friend_streak')`,
    ),
  }),
);

/** Origen de una lectura y sus reglas de cuota/privacidad asociadas. */
export type ReadingOriginType = 'personal' | 'friend_copy' | 'friend_streak';

/** Estado de una solicitud o relación de amistad. */
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

/** Canal por el que se originó una solicitud de amistad. */
export type FriendshipOrigin = 'email' | 'invite_link';

/** Solicitud o relación bilateral de amistad. */
export const friendships = pgTable(
  'friendships',
  {
    id: serial('id').primaryKey(),
    requesterId: integer('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: integer('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 })
      .$type<FriendshipStatus>()
      .notNull()
      .default('pending'),
    origin: varchar('origin', { length: 20 }).$type<FriendshipOrigin>().notNull().default('email'),
    respondedAt: timestamp('responded_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    requesterIdx: index('idx_friendships_requester_id').on(table.requesterId),
    addresseeIdx: index('idx_friendships_addressee_id').on(table.addresseeId),
    statusIdx: index('idx_friendships_status').on(table.status),
    activePairUnique: uniqueIndex('uq_friendships_active_pair')
      .using(
        'btree',
        sql`LEAST(${table.requesterId}, ${table.addresseeId})`,
        sql`GREATEST(${table.requesterId}, ${table.addresseeId})`,
      )
      .where(sql`${table.status} IN ('pending', 'accepted')`),
    statusCheck: check(
      'friendships_status_check',
      sql`${table.status} IN ('pending', 'accepted', 'rejected', 'cancelled')`,
    ),
    originCheck: check(
      'friendships_origin_check',
      sql`${table.origin} IN ('email', 'invite_link')`,
    ),
    differentUsersCheck: check(
      'friendships_different_users_check',
      sql`${table.requesterId} <> ${table.addresseeId}`,
    ),
  }),
);

/** Enlace compartible de invitación; solo se persiste el hash del token. */
export const friendInviteLinks = pgTable(
  'friend_invite_links',
  {
    id: serial('id').primaryKey(),
    creatorUserId: integer('creator_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    maxUses: integer('max_uses').default(1),
    usesCount: integer('uses_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: false }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    creatorIdx: index('idx_friend_invite_links_creator_user_id').on(table.creatorUserId),
    expiresIdx: index('idx_friend_invite_links_expires_at').on(table.expiresAt),
    maxUsesCheck: check(
      'friend_invite_links_max_uses_check',
      sql`${table.maxUses} IS NULL OR ${table.maxUses} >= 1`,
    ),
    usesCountCheck: check('friend_invite_links_uses_count_check', sql`${table.usesCount} >= 0`),
  }),
);

/** Bloqueo unidireccional entre dos usuarios. */
export const userBlocks = pgTable(
  'user_blocks',
  {
    id: serial('id').primaryKey(),
    blockerId: integer('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: integer('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    blockerIdx: index('idx_user_blocks_blocker_id').on(table.blockerId),
    blockedIdx: index('idx_user_blocks_blocked_id').on(table.blockedId),
    pairUnique: unique('uq_user_blocks_blocker_blocked').on(table.blockerId, table.blockedId),
    differentUsersCheck: check(
      'user_blocks_different_users_check',
      sql`${table.blockerId} <> ${table.blockedId}`,
    ),
  }),
);

/** Configuración y acumulado de una racha compartida entre dos amigos. */
export const friendStreaks = pgTable(
  'friend_streaks',
  {
    id: serial('id').primaryKey(),
    friendshipId: integer('friendship_id')
      .notNull()
      .references(() => friendships.id, { onDelete: 'cascade' }),
    userLowId: integer('user_low_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userHighId: integer('user_high_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    initiatedByUserId: integer('initiated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 })
      .$type<FriendStreakStatus>()
      .notNull()
      .default('pending_partner'),
    userLowCategories: jsonb('user_low_categories').$type<string[]>().notNull().default([]),
    userHighCategories: jsonb('user_high_categories').$type<string[]>().notNull().default([]),
    language: varchar('language', { length: 10 }).notNull(),
    difficulty: varchar('difficulty', { length: 20 })
      .$type<FriendStreakDifficulty>()
      .notNull()
      .default('medium'),
    size: varchar('size', { length: 20 }).$type<FriendStreakSize>().notNull().default('medium'),
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    lastCompletedDate: date('last_completed_date'),
    startedAt: timestamp('started_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    friendshipIdx: index('idx_friend_streaks_friendship_id').on(table.friendshipId),
    statusIdx: index('idx_friend_streaks_status').on(table.status),
    activePairUnique: uniqueIndex('uq_friend_streaks_active_pair')
      .on(table.userLowId, table.userHighId)
      .where(sql`${table.status} IN ('pending_partner', 'active', 'paused')`),
    statusCheck: check(
      'friend_streaks_status_check',
      sql`${table.status} IN ('pending_partner', 'active', 'paused', 'ended')`,
    ),
    languageCheck: check(
      'friend_streaks_language_check',
      sql`${table.language} IN ('es', 'en', 'fr', 'it')`,
    ),
    difficultyCheck: check(
      'friend_streaks_difficulty_check',
      sql`${table.difficulty} IN ('easy', 'medium', 'hard')`,
    ),
    sizeCheck: check(
      'friend_streaks_size_check',
      sql`${table.size} IN ('short', 'medium', 'long')`,
    ),
    orderedUsersCheck: check(
      'friend_streaks_ordered_users_check',
      sql`${table.userLowId} < ${table.userHighId}`,
    ),
  }),
);

/** Lecturas privadas generadas para cada participante en un día de racha. */
export const friendStreakDays = pgTable(
  'friend_streak_days',
  {
    id: serial('id').primaryKey(),
    streakId: integer('streak_id')
      .notNull()
      .references(() => friendStreaks.id, { onDelete: 'cascade' }),
    streakDate: date('streak_date').notNull(),
    selectedCategory: varchar('selected_category', { length: 100 }).notNull(),
    userLowReadingId: integer('user_low_reading_id').references(() => readings.id, {
      onDelete: 'set null',
    }),
    userHighReadingId: integer('user_high_reading_id').references(() => readings.id, {
      onDelete: 'set null',
    }),
    userLowCompletedAt: timestamp('user_low_completed_at', { withTimezone: false }),
    userHighCompletedAt: timestamp('user_high_completed_at', { withTimezone: false }),
    status: varchar('status', { length: 25 })
      .$type<FriendStreakDayStatus>()
      .notNull()
      .default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    dateStatusIdx: index('idx_friend_streak_days_date_status').on(table.streakDate, table.status),
    streakDateUnique: unique('uq_friend_streak_days_streak_date').on(
      table.streakId,
      table.streakDate,
    ),
    statusCheck: check(
      'friend_streak_days_status_check',
      sql`${table.status} IN ('pending', 'completed', 'missed', 'generation_failed')`,
    ),
  }),
);

/** Estado de una racha compartida. */
export type FriendStreakStatus = 'pending_partner' | 'active' | 'paused' | 'ended';
export type FriendStreakDifficulty = 'easy' | 'medium' | 'hard';
export type FriendStreakSize = 'short' | 'medium' | 'long';
export type FriendStreakDayStatus = 'pending' | 'completed' | 'missed' | 'generation_failed';

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

/** Estado de suscripción recurrente reflejado desde Stripe. */
export type BillingSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/** Espejo de la suscripción recurrente de Stripe por usuario. */
export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull().default('stripe'),
    stripeCustomerId: varchar('stripe_customer_id', { length: 64 }).notNull(),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 64 }).notNull().unique(),
    stripePriceId: varchar('stripe_price_id', { length: 64 }).notNull(),
    tier: varchar('tier', { length: 30 }).notNull(),
    status: varchar('status', { length: 30 })
      .$type<BillingSubscriptionStatus | (string & {})>()
      .notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: false }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: false }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: false }),
    paymentMethodBrand: varchar('payment_method_brand', { length: 30 }),
    paymentMethodLast4: varchar('payment_method_last4', { length: 4 }),
    paymentMethodExpMonth: integer('payment_method_exp_month'),
    paymentMethodExpYear: integer('payment_method_exp_year'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index('idx_billing_subscriptions_customer').on(table.stripeCustomerId),
    statusIdx: index('idx_billing_subscriptions_status').on(table.status),
  }),
);

/** Tipo de pago registrado en `billing_payments`. */
export type BillingPaymentKind = 'subscription' | 'subscription_invoice' | 'language_unlock';

/** Historial e idempotencia de pagos únicos y facturas de suscripción. */
export const billingPayments = pgTable(
  'billing_payments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull().default('stripe'),
    kind: varchar('kind', { length: 40 }).$type<BillingPaymentKind | (string & {})>().notNull(),
    tier: varchar('tier', { length: 30 }),
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 128 }).unique(),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 128 }),
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 128 }).unique(),
    amountCents: integer('amount_cents').notNull().default(0),
    currency: varchar('currency', { length: 10 }).notNull().default('mxn'),
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: false }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('idx_billing_payments_user_created').on(table.userId, table.createdAt),
    kindStatusIdx: index('idx_billing_payments_kind_status').on(table.kind, table.status),
  }),
);

/** Registro de deduplicación e idempotencia por `event_id` recibido en webhooks de Stripe. */
export const billingWebhookEvents = pgTable(
  'billing_webhook_events',
  {
    eventId: varchar('event_id', { length: 120 }).primaryKey(),
    provider: varchar('provider', { length: 20 }).notNull().default('stripe'),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('processing'),
    errorMessage: text('error_message'),
    processedAt: timestamp('processed_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    typeCreatedIdx: index('idx_billing_webhook_events_type_created').on(
      table.eventType,
      table.createdAt,
    ),
  }),
);

/** Proveedor externo OAuth 2.0 / OIDC soportado por la plataforma. */
export type OAuthProvider = 'google' | 'microsoft';

/** Identidades externas OAuth 2.0 / OIDC vinculadas a cada cuenta de usuario. */
export const userOAuthAccounts = pgTable(
  'user_oauth_accounts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 30 }).$type<OAuthProvider>().notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    providerEmail: varchar('provider_email', { length: 254 }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    providerSubUnique: uniqueIndex('uq_user_oauth_accounts_provider_sub').on(
      table.provider,
      table.providerUserId,
    ),
    userProviderUnique: uniqueIndex('uq_user_oauth_accounts_user_provider').on(
      table.userId,
      table.provider,
    ),
    userIdIdx: index('idx_user_oauth_accounts_user_id').on(table.userId),
  }),
);

/** Mapa completo de tablas exportadas para consultas relacionales de Drizzle. */

export const schema = {
  roles,
  users,
  userOAuthAccounts,
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
  billingSubscriptions,
  billingPayments,
  billingWebhookEvents,
  friendships,
  friendInviteLinks,
  userBlocks,
  friendStreaks,
  friendStreakDays,
};
