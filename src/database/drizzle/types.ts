import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  users,
  userSettings,
  authAccessTokens,
  readings,
  readingExplanations,
  promptLogs,
} from './schema';

/** Modelos inferidos de lectura (`Select`) e inserción (`Insert`) a partir del esquema Drizzle. */
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type UserSettings = InferSelectModel<typeof userSettings>;
export type NewUserSettings = InferInsertModel<typeof userSettings>;

export type AccessToken = InferSelectModel<typeof authAccessTokens>;
export type NewAccessToken = InferInsertModel<typeof authAccessTokens>;

export type Reading = InferSelectModel<typeof readings>;
export type NewReading = InferInsertModel<typeof readings>;

export type ReadingExplanation = InferSelectModel<typeof readingExplanations>;
export type NewReadingExplanation = InferInsertModel<typeof readingExplanations>;

export type PromptLog = InferSelectModel<typeof promptLogs>;
export type NewPromptLog = InferInsertModel<typeof promptLogs>;
