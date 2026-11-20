import { Injectable } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';

/** Acciones de facturación protegidas por límite de tasa por usuario. */
export type BillingRateLimitAction = 'checkout' | 'setup_intent' | 'mutation' | 'sync' | 'invoices';

export interface BillingRateLimitRule {
  maxRequests: number;
  windowMs: number;
}

/**
 * Límites por ventana deslizante de 60 segundos por usuario autenticado.
 * Mitiga clics repetidos, abuso de SetupIntent (card testing) y ráfagas a la API de Stripe.
 */
export const BILLING_RATE_LIMITS: Record<BillingRateLimitAction, BillingRateLimitRule> = {
  checkout: { maxRequests: 5, windowMs: 60_000 },
  setup_intent: { maxRequests: 5, windowMs: 60_000 },
  mutation: { maxRequests: 10, windowMs: 60_000 },
  sync: { maxRequests: 15, windowMs: 60_000 },
  invoices: { maxRequests: 20, windowMs: 60_000 },
};

const MAX_TRACKED_BUCKETS = 2000;

/**
 * Limitador de tasa por usuario y acción mediante ventana deslizante en memoria.
 */
@Injectable()
export class BillingRateLimitService {
  private readonly buckets = new Map<string, number[]>();

  /**
   * Registra una petición válida o lanza `429 BILLING_RATE_LIMITED` si el usuario
   * excedió el máximo permitido dentro de la ventana actual.
   */
  assertWithinLimit(userId: number, action: BillingRateLimitAction, now = Date.now()): void {
    const rule = BILLING_RATE_LIMITS[action];
    const key = `${action}:${userId}`;
    const windowStart = now - rule.windowMs;
    const recent = (this.buckets.get(key) ?? []).filter((ts) => ts > windowStart);

    if (recent.length >= rule.maxRequests) {
      this.buckets.set(key, recent);
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
      throw new AppHttpException(ErrorCode.BILLING_RATE_LIMITED, {
        action,
        limit: rule.maxRequests,
        windowSeconds: Math.round(rule.windowMs / 1000),
        retryAfterSeconds,
      });
    }

    recent.push(now);
    this.buckets.set(key, recent);
    this.pruneExpiredBuckets(now);
  }

  /** Limpia el estado interno del limitador (útil entre pruebas). */
  reset(): void {
    this.buckets.clear();
  }

  private pruneExpiredBuckets(now: number): void {
    if (this.buckets.size <= MAX_TRACKED_BUCKETS) {
      return;
    }

    for (const [key, timestamps] of this.buckets) {
      const action = key.split(':')[0] as BillingRateLimitAction;
      const rule = BILLING_RATE_LIMITS[action];
      const cutoff = now - rule.windowMs;
      if (timestamps.every((ts) => ts <= cutoff)) {
        this.buckets.delete(key);
      }
    }
  }
}
