import { relations } from 'drizzle-orm';
import {
  users,
  authAccessTokens,
  authEmailTokens,
  readings,
  readingExplanations,
  promptLogs,
} from './schema';

/** Relaciones salientes de la tabla `users`. */
export const usersRelations = relations(users, ({ many }) => ({
  readings: many(readings),
  explanations: many(readingExplanations),
  accessTokens: many(authAccessTokens),
  emailTokens: many(authEmailTokens),
  promptLogs: many(promptLogs),
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
