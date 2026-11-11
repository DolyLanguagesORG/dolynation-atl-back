export const SUBSCRIPTION_TIERS = ['dolly', 'dolly_plus', 'dolly_pro'] as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export interface SubscriptionPlanConfig {
  id: SubscriptionTier;
  name: string;
  description: string;
  maxCategories: number | null; // null = unlimited
  allowedLanguages: readonly string[]; // ISO language codes
  dailyReadingsLimit: number | null; // null = unlimited
  dailyQuestionsLimit: number | null; // null = unlimited
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlanConfig> = {
  dolly: {
    id: 'dolly',
    name: 'Dolly',
    description:
      'Suscripción básica: hasta 5 categorías, lecturas exclusivamente en inglés, 10 lecturas nuevas al día y 15 preguntas de comprensión/vocabulario al día.',
    maxCategories: 5,
    allowedLanguages: ['en'],
    dailyReadingsLimit: 10,
    dailyQuestionsLimit: 15,
  },
  dolly_plus: {
    id: 'dolly_plus',
    name: 'Dolly Plus',
    description:
      'Suscripción intermedia: hasta 15 categorías, todos los idiomas disponibles habilitados, 20 lecturas nuevas al día y 30 preguntas de comprensión/vocabulario al día.',
    maxCategories: 15,
    allowedLanguages: ['en', 'es', 'fr', 'pt', 'de'],
    dailyReadingsLimit: 20,
    dailyQuestionsLimit: 30,
  },
  dolly_pro: {
    id: 'dolly_pro',
    name: 'Dolly Pro',
    description:
      'Suscripción avanzada: categorías ilimitadas, todos los idiomas disponibles habilitados, lecturas y preguntas de comprensión/vocabulario ilimitadas.',
    maxCategories: null,
    allowedLanguages: ['en', 'es', 'fr', 'pt', 'de'],
    dailyReadingsLimit: null,
    dailyQuestionsLimit: null,
  },
};

export const TIMEZONE_RESET = 'America/Mexico_City';

/**
 * Calculates the start of the current calendar day (00:00:00 local time)
 * in the configured business timezone (America/Mexico_City) as a UTC Date instance.
 */
export function getStartOfDayInTimeZone(
  timeZone: string = TIMEZONE_RESET,
  now: Date = new Date(),
): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const temp = new Date(`${ymd}T00:00:00Z`);
  const invDate = new Date(temp.toLocaleString('en-US', { timeZone: 'UTC' }));
  const inTz = new Date(temp.toLocaleString('en-US', { timeZone }));
  const diff = invDate.getTime() - inTz.getTime();
  return new Date(temp.getTime() + diff);
}

export function isValidSubscriptionTier(tier: unknown): tier is SubscriptionTier {
  return typeof tier === 'string' && (SUBSCRIPTION_TIERS as readonly string[]).includes(tier);
}
