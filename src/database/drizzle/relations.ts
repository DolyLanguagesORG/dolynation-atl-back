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
  explanations: many(readingExplanations),
  promptLogs: many(promptLogs),
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
