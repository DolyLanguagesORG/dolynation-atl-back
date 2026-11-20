import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
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
  billingSubscriptions,
  billingPayments,
  billingWebhookEvents,
} from './schema';

/** Modelos inferidos de lectura (`Select`) e inserción (`Insert`) a partir del esquema Drizzle. */
export type Role = InferSelectModel<typeof roles>;
export type NewRole = InferInsertModel<typeof roles>;

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type UserSettings = InferSelectModel<typeof userSettings>;
export type NewUserSettings = InferInsertModel<typeof userSettings>;

export type AccessToken = InferSelectModel<typeof authAccessTokens>;
export type NewAccessToken = InferInsertModel<typeof authAccessTokens>;

export type AuthEmailToken = InferSelectModel<typeof authEmailTokens>;
export type NewAuthEmailToken = InferInsertModel<typeof authEmailTokens>;

export type AccessRequest = InferSelectModel<typeof accessRequests>;
export type NewAccessRequest = InferInsertModel<typeof accessRequests>;
export type { AccessRequestType, AccessRequestStatus } from './schema';

export type Reading = InferSelectModel<typeof readings>;
export type NewReading = InferInsertModel<typeof readings>;

export type ReadingExplanation = InferSelectModel<typeof readingExplanations>;
export type NewReadingExplanation = InferInsertModel<typeof readingExplanations>;
export type {
  ExplanationEntryType,
  WordBreakdownItem,
  AlternativeExpressionItem,
  UsageContextItem,
} from './schema';

export type PromptLog = InferSelectModel<typeof promptLogs>;
export type NewPromptLog = InferInsertModel<typeof promptLogs>;

export type ModeratedCategory = InferSelectModel<typeof moderatedCategories>;
export type NewModeratedCategory = InferInsertModel<typeof moderatedCategories>;
export type { CategoryPromptProfile } from './schema';

export type CategoryDailyUsage = InferSelectModel<typeof categoryDailyUsage>;
export type NewCategoryDailyUsage = InferInsertModel<typeof categoryDailyUsage>;

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type NewAuditLog = InferInsertModel<typeof auditLogs>;
export type { AuditLogAction } from './schema';

export type ErrorLog = InferSelectModel<typeof errorLogs>;
export type NewErrorLog = InferInsertModel<typeof errorLogs>;
export type { ErrorLogSeverity } from './schema';

export type BillingSubscription = InferSelectModel<typeof billingSubscriptions>;
export type NewBillingSubscription = InferInsertModel<typeof billingSubscriptions>;
export type { BillingSubscriptionStatus } from './schema';

export type BillingPayment = InferSelectModel<typeof billingPayments>;
export type NewBillingPayment = InferInsertModel<typeof billingPayments>;
export type { BillingPaymentKind } from './schema';

export type BillingWebhookEvent = InferSelectModel<typeof billingWebhookEvents>;
export type NewBillingWebhookEvent = InferInsertModel<typeof billingWebhookEvents>;
