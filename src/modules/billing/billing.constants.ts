import type { AppConfigService } from '../../config/env.config';
import type { SubscriptionTier } from '../subscriptions/subscriptions.constants';

/** Token de inyección para el puerto de pasarela de pagos. */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Modos de UI soportados al crear una sesión de Checkout en Stripe. */
export const BILLING_UI_MODES = ['custom', 'hosted'] as const;
export type BillingUiMode = (typeof BILLING_UI_MODES)[number];

/** Planes de suscripción que requieren cobro mediante pasarela. */
export const PAID_SUBSCRIPTION_TIERS = ['dolly_plus', 'dolly_pro'] as const;
export type PaidSubscriptionTier = (typeof PAID_SUBSCRIPTION_TIERS)[number];

/** Estados de suscripción de Stripe que representan un plan pagado vigente o en cobro. */
export const ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

/** TTL en memoria (5 minutos) para cachear los precios consultados a Stripe. */
export const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Estados de suscripción de Stripe que NO acreditan un plan pagado.
 *
 * `incomplete` es lo que Stripe emite en cuanto arranca el cobro (3DS
 * abandonado, SPEI/OXXO sin confirmar, tarjeta rechazada): el pago todavía
 * no está. `paused` es un cobro suspendido. `past_due` NO va aqui: es
 * dunning (el cobro se reintenta) y mantiene el plan.
 */
export const NON_ENTITLING_STRIPE_SUBSCRIPTION_STATUSES = [
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
] as const;

/**
 * Tiempo tras el cual un webhook que quedo en 'processing' se considera
 * atascado y se puede reclamar.
 *
 * Sin esto, un proceso que muere entre el INSERT y el UPDATE deja la fila
 * en 'processing' para siempre: Stripe recibe un 200 y deja de entregar ese
 * evento, y la activacion de la suscripcion se pierde en silencio.
 */
export const STALE_WEBHOOK_PROCESSING_MS = 5 * 60 * 1000;

/** Verifica si un nivel corresponde a un plan de suscripción de pago. */
export function isPaidSubscriptionTier(tier: unknown): tier is PaidSubscriptionTier {
  return typeof tier === 'string' && (PAID_SUBSCRIPTION_TIERS as readonly string[]).includes(tier);
}

/** Verifica si el estado de una suscripción Stripe la mantiene vigente o en recuperación. */
export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  return (
    typeof status === 'string' &&
    (ACTIVE_STRIPE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
  );
}

/** Resuelve el `Price ID` de Stripe configurado para un tier determinado. */
export function resolvePriceIdForTier(
  tier: SubscriptionTier,
  config: AppConfigService,
): string | undefined {
  switch (tier) {
    case 'dolly':
      return config.billing.stripe.prices.dolly;
    case 'dolly_plus':
      return config.billing.stripe.prices.dollyPlus;
    case 'dolly_pro':
      return config.billing.stripe.prices.dollyPro;
  }
}

/** Resuelve el tier interno correspondiente a un `Price ID` de Stripe configurado. */
export function resolveTierForPriceId(
  priceId: string | null | undefined,
  config: AppConfigService,
): SubscriptionTier | null {
  if (!priceId) return null;
  const { prices } = config.billing.stripe;
  if (prices.dollyPlus && priceId === prices.dollyPlus) return 'dolly_plus';
  if (prices.dollyPro && priceId === prices.dollyPro) return 'dolly_pro';
  if (prices.dolly && priceId === prices.dolly) return 'dolly';
  return null;
}
