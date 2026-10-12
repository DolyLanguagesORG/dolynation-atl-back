import { relations } from 'drizzle-orm';
import { users, authAccessTokens, readings, promptLogs } from './schema';

export const usersRelations = relations(users, ({ many }) => ({
  readings: many(readings),
  accessTokens: many(authAccessTokens),
  promptLogs: many(promptLogs),
}));

export const readingsRelations = relations(readings, ({ one, many }) => ({
  user: one(users, { fields: [readings.userId], references: [users.id] }),
  promptLogs: many(promptLogs),
}));

export const authAccessTokensRelations = relations(authAccessTokens, ({ one }) => ({
  user: one(users, { fields: [authAccessTokens.tokenableId], references: [users.id] }),
}));

export const promptLogsRelations = relations(promptLogs, ({ one }) => ({
  user: one(users, { fields: [promptLogs.userId], references: [users.id] }),
  reading: one(readings, { fields: [promptLogs.textId], references: [readings.id] }),
}));
