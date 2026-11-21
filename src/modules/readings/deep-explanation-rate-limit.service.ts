import { Injectable } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';

/** Máximo de explicaciones detalladas por usuario dentro de la ventana. */
export const DEEP_EXPLANATION_MAX_REQUESTS = 20;
/** Ventana deslizante del límite (10 minutos). */
export const DEEP_EXPLANATION_WINDOW_MS = 10 * 60_000;

const MAX_TRACKED_USERS = 5000;

/**
 * Límite por usuario para `POST /readings/:id/explanations/deep`. Cada llamada consume
 * tokens del proveedor de IA, así que se acota igual que el chat directo. Vive en memoria
 * por proceso, igual que el limitador de facturación.
 */
@Injectable()
export class DeepExplanationRateLimitService {
  private readonly buckets = new Map<number, number[]>();

  /** Registra la llamada o lanza `AI_RATE_LIMITED` (429) si el usuario excedió el límite. */
  assertWithinLimit(userId: number, now = Date.now()): void {
    const windowStart = now - DEEP_EXPLANATION_WINDOW_MS;
    const recent = (this.buckets.get(userId) ?? []).filter((ts) => ts > windowStart);

    if (recent.length >= DEEP_EXPLANATION_MAX_REQUESTS) {
      this.buckets.set(userId, recent);
      const oldest = recent[0] ?? now;
      throw new AppHttpException(ErrorCode.AI_RATE_LIMITED, {
        reason: 'deep-explanation-user-limit',
        limit: DEEP_EXPLANATION_MAX_REQUESTS,
        windowSeconds: DEEP_EXPLANATION_WINDOW_MS / 1000,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((oldest + DEEP_EXPLANATION_WINDOW_MS - now) / 1000),
        ),
      });
    }

    recent.push(now);
    this.buckets.set(userId, recent);
    this.pruneExpired(windowStart);
  }

  private pruneExpired(windowStart: number): void {
    if (this.buckets.size <= MAX_TRACKED_USERS) return;
    for (const [userId, timestamps] of this.buckets) {
      if (timestamps.every((ts) => ts <= windowStart)) {
        this.buckets.delete(userId);
      }
    }
  }
}
