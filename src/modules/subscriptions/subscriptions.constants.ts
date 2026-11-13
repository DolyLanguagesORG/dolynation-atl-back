import { SUPPORTED_LANGUAGE_IDS } from '../settings/settings.constants';

/** Niveles de suscripción válidos soportados por la plataforma. */
export const SUBSCRIPTION_TIERS = ['dolly', 'dolly_plus', 'dolly_pro'] as const;

/** Identificador tipado de nivel de suscripción. */
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

/** Configuración y límites de cuotas de un plan de suscripción. */
export interface SubscriptionPlanConfig {
  id: SubscriptionTier;
  name: string;
  description: string;
  maxCategories: number | null; // `null` equivale a categorías ilimitadas
  maxLanguages: number; // Cupos simultáneos de idiomas elegibles por el usuario
  allowedLanguages: readonly string[]; // Catálogo de códigos de idioma elegibles
  dailyReadingsLimit: number | null; // `null` equivale a lecturas diarias ilimitadas
  dailyQuestionsLimit: number | null; // `null` equivale a preguntas diarias ilimitadas
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlanConfig> = {
  dolly: {
    id: 'dolly',
    name: 'Dolly',
    description:
      'Suscripción básica: hasta 5 categorías, 1 idioma elegible (entre ES, EN, FR e IT), 10 lecturas nuevas y 15 preguntas al día.',
    maxCategories: 5,
    maxLanguages: 1,
    allowedLanguages: [...SUPPORTED_LANGUAGE_IDS],
    dailyReadingsLimit: 10,
    dailyQuestionsLimit: 15,
  },
  dolly_plus: {
    id: 'dolly_plus',
    name: 'Dolly Plus',
    description:
      'Suscripción intermedia: hasta 15 categorías, hasta 2 idiomas simultáneos elegibles (entre ES, EN, FR e IT), 20 lecturas nuevas y 30 preguntas al día.',
    maxCategories: 15,
    maxLanguages: 2,
    allowedLanguages: [...SUPPORTED_LANGUAGE_IDS],
    dailyReadingsLimit: 20,
    dailyQuestionsLimit: 30,
  },
  dolly_pro: {
    id: 'dolly_pro',
    name: 'Dolly Pro',
    description:
      'Suscripción avanzada: categorías ilimitadas, los 4 idiomas disponibles (ES, EN, FR e IT) elegibles simultáneamente, lecturas y preguntas ilimitadas.',
    maxCategories: null,
    maxLanguages: 4,
    allowedLanguages: [...SUPPORTED_LANGUAGE_IDS],
    dailyReadingsLimit: null,
    dailyQuestionsLimit: null,
  },
};

/** Devuelve el límite máximo de idiomas simultáneos permitidos para un tier o `0` si no tiene plan válido. */
export function getMaxLanguagesForTier(tier: string | null | undefined): number {
  return isValidSubscriptionTier(tier) ? SUBSCRIPTION_PLANS[tier].maxLanguages : 0;
}

/** Zona horaria de negocio usada para reiniciar los límites diarios a medianoche. */
export const TIMEZONE_RESET = 'America/Mexico_City';

/**
 * Obtiene la fecha calendario (`YYYY-MM-DD`) en la zona horaria de negocio (`America/Mexico_City`).
 */
export function getDateKeyInTimeZone(
  timeZone: string = TIMEZONE_RESET,
  now: Date = new Date(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Calcula el inicio del día calendario actual (00:00:00 hora local)
 * en la zona horaria de negocio configurada (`America/Mexico_City`) como instancia `Date` en UTC.
 */
export function getStartOfDayInTimeZone(
  timeZone: string = TIMEZONE_RESET,
  now: Date = new Date(),
): Date {
  const ymd = getDateKeyInTimeZone(timeZone, now);
  const temp = new Date(`${ymd}T00:00:00Z`);
  const invDate = new Date(temp.toLocaleString('en-US', { timeZone: 'UTC' }));
  const inTz = new Date(temp.toLocaleString('en-US', { timeZone }));
  const diff = invDate.getTime() - inTz.getTime();
  return new Date(temp.getTime() + diff);
}

/** Verifica si un valor desconocido corresponde a un `SubscriptionTier` válido. */
export function isValidSubscriptionTier(tier: unknown): tier is SubscriptionTier {
  return typeof tier === 'string' && (SUBSCRIPTION_TIERS as readonly string[]).includes(tier);
}
