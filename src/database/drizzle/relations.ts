import { relations } from 'drizzle-orm';
import {
  roles,
  users,
  userOAuthAccounts,
  authAccessTokens,
  authEmailTokens,
  accessRequests,
  readings,
  readingExplanations,
  promptLogs,
  auditLogs,
  errorLogs,
  billingSubscriptions,
  billingPayments,
  friendships,
  friendInviteLinks,
  userBlocks,
  friendStreaks,
  friendStreakDays,
} from './schema';

/** Relaciones de cada rol con los usuarios asignados. */
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

/** Relaciones salientes de la tabla `users`. */
export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  oauthAccounts: many(userOAuthAccounts),
  readings: many(readings),
  explanations: many(readingExplanations),
  accessTokens: many(authAccessTokens),
  emailTokens: many(authEmailTokens),
  accessRequests: many(accessRequests, { relationName: 'accessRequestUser' }),
  reviewedAccessRequests: many(accessRequests, { relationName: 'accessRequestReviewer' }),
  promptLogs: many(promptLogs),
  auditLogsAsActor: many(auditLogs, { relationName: 'auditLogActor' }),
  auditLogsAsTarget: many(auditLogs, { relationName: 'auditLogTarget' }),
  errorLogs: many(errorLogs),
  billingSubscription: one(billingSubscriptions, {
    fields: [users.id],
    references: [billingSubscriptions.userId],
  }),
  billingPayments: many(billingPayments),
  requestedFriendships: many(friendships, { relationName: 'friendshipRequester' }),
  receivedFriendships: many(friendships, { relationName: 'friendshipAddressee' }),
  createdInviteLinks: many(friendInviteLinks),
  blocksCreated: many(userBlocks, { relationName: 'blocker' }),
  blocksReceived: many(userBlocks, { relationName: 'blocked' }),
  lowFriendStreaks: many(friendStreaks, { relationName: 'friendStreakLowUser' }),
  highFriendStreaks: many(friendStreaks, { relationName: 'friendStreakHighUser' }),
  initiatedFriendStreaks: many(friendStreaks, { relationName: 'friendStreakInitiator' }),
}));

/** Relaciones de las solicitudes de acceso con el solicitante y el administrador revisor. */
export const accessRequestsRelations = relations(accessRequests, ({ one }) => ({
  user: one(users, {
    fields: [accessRequests.userId],
    references: [users.id],
    relationName: 'accessRequestUser',
  }),
  reviewedBy: one(users, {
    fields: [accessRequests.reviewedByUserId],
    references: [users.id],
    relationName: 'accessRequestReviewer',
  }),
}));

/** Relaciones de cada lectura con su autor, explicaciones y bitácora de prompts. */
export const readingsRelations = relations(readings, ({ one, many }) => ({
  user: one(users, { fields: [readings.userId], references: [users.id] }),
  sourceReading: one(readings, {
    fields: [readings.sourceReadingId],
    references: [readings.id],
    relationName: 'readingSource',
  }),
  copiedReadings: many(readings, { relationName: 'readingSource' }),
  friendStreakDay: one(friendStreakDays, {
    fields: [readings.friendStreakDayId],
    references: [friendStreakDays.id],
    relationName: 'readingFriendStreakDay',
  }),
  lowFriendStreakDays: many(friendStreakDays, { relationName: 'friendStreakLowReading' }),
  highFriendStreakDays: many(friendStreakDays, { relationName: 'friendStreakHighReading' }),
  explanations: many(readingExplanations),
  promptLogs: many(promptLogs),
}));

/** Relaciones de solicitudes, bloqueos, enlaces y rachas de amistad. */
export const friendshipsRelations = relations(friendships, ({ one, many }) => ({
  requester: one(users, {
    fields: [friendships.requesterId],
    references: [users.id],
    relationName: 'friendshipRequester',
  }),
  addressee: one(users, {
    fields: [friendships.addresseeId],
    references: [users.id],
    relationName: 'friendshipAddressee',
  }),
  streaks: many(friendStreaks),
}));

export const friendInviteLinksRelations = relations(friendInviteLinks, ({ one }) => ({
  creator: one(users, { fields: [friendInviteLinks.creatorUserId], references: [users.id] }),
}));

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(users, {
    fields: [userBlocks.blockerId],
    references: [users.id],
    relationName: 'blocker',
  }),
  blocked: one(users, {
    fields: [userBlocks.blockedId],
    references: [users.id],
    relationName: 'blocked',
  }),
}));

export const friendStreaksRelations = relations(friendStreaks, ({ one, many }) => ({
  friendship: one(friendships, {
    fields: [friendStreaks.friendshipId],
    references: [friendships.id],
  }),
  lowUser: one(users, {
    fields: [friendStreaks.userLowId],
    references: [users.id],
    relationName: 'friendStreakLowUser',
  }),
  highUser: one(users, {
    fields: [friendStreaks.userHighId],
    references: [users.id],
    relationName: 'friendStreakHighUser',
  }),
  initiatedBy: one(users, {
    fields: [friendStreaks.initiatedByUserId],
    references: [users.id],
    relationName: 'friendStreakInitiator',
  }),
  days: many(friendStreakDays),
}));

export const friendStreakDaysRelations = relations(friendStreakDays, ({ one, many }) => ({
  streak: one(friendStreaks, {
    fields: [friendStreakDays.streakId],
    references: [friendStreaks.id],
  }),
  lowReading: one(readings, {
    fields: [friendStreakDays.userLowReadingId],
    references: [readings.id],
    relationName: 'friendStreakLowReading',
  }),
  highReading: one(readings, {
    fields: [friendStreakDays.userHighReadingId],
    references: [readings.id],
    relationName: 'friendStreakHighReading',
  }),
  readings: many(readings, { relationName: 'readingFriendStreakDay' }),
}));

/** Relaciones de cada explicación de vocabulario con la lectura y usuario correspondientes. */
export const readingExplanationsRelations = relations(readingExplanations, ({ one }) => ({
  reading: one(readings, { fields: [readingExplanations.readingId], references: [readings.id] }),
  user: one(users, { fields: [readingExplanations.userId], references: [users.id] }),
}));

/** Relación entre tokens de sesión persistidos y el usuario propietario. */
export const authAccessTokensRelations = relations(authAccessTokens, ({ one }) => ({
  user: one(users, { fields: [authAccessTokens.tokenableId], references: [users.id] }),
}));

/** Relación entre tokens de correo (verificación / restablecimiento) y su usuario propietario. */
export const authEmailTokensRelations = relations(authEmailTokens, ({ one }) => ({
  user: one(users, { fields: [authEmailTokens.userId], references: [users.id] }),
}));

/** Relaciones opcionales de los registros de `prompt_logs` con usuario y lectura. */
export const promptLogsRelations = relations(promptLogs, ({ one }) => ({
  user: one(users, { fields: [promptLogs.userId], references: [users.id] }),
  reading: one(readings, { fields: [promptLogs.textId], references: [readings.id] }),
}));

/** Relaciones de los registros de auditoría con el usuario actor y el usuario afectado. */
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actorUser: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
    relationName: 'auditLogActor',
  }),
  targetUser: one(users, {
    fields: [auditLogs.targetUserId],
    references: [users.id],
    relationName: 'auditLogTarget',
  }),
}));

/** Relación opcional de los registros de `error_logs` con el usuario actor. */
export const errorLogsRelations = relations(errorLogs, ({ one }) => ({
  actorUser: one(users, { fields: [errorLogs.actorUserId], references: [users.id] }),
}));

/** Relación 1:1 entre suscripción de Stripe y usuario propietario. */
export const billingSubscriptionsRelations = relations(billingSubscriptions, ({ one }) => ({
  user: one(users, { fields: [billingSubscriptions.userId], references: [users.id] }),
}));

/** Relación de pagos de Stripe con su usuario propietario. */
export const billingPaymentsRelations = relations(billingPayments, ({ one }) => ({
  user: one(users, { fields: [billingPayments.userId], references: [users.id] }),
}));

/** Relación de identidades externas OAuth vinculadas a su usuario propietario. */
export const userOAuthAccountsRelations = relations(userOAuthAccounts, ({ one }) => ({
  user: one(users, { fields: [userOAuthAccounts.userId], references: [users.id] }),
}));
