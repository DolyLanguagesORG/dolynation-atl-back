import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/env.config';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { IpRateLimitRule } from './decorators/rate-limit-by-ip.decorator';

const MAX_TRACKED_BUCKETS = 10_000;

interface BucketEntry {
  timestamps: number[];
  windowMs: number;
}

/**
 * Limitador de tasa por IP real en ventana deslizante en memoria.
 * Mitiga fuerza bruta, creación masiva de cuentas y abuso antes de llegar a IA/Stripe.
 */
@Injectable()
export class IpRateLimitService {
  private readonly buckets = new Map<string, BucketEntry>();

  constructor(private readonly config: AppConfigService) {}

  /**
   * Registra una petición válida o lanza `429 RATE_LIMIT_EXCEEDED` si la IP
   * superó el límite configurado para `rule.action`.
   */
  assertWithinLimit(clientIp: string | null, rule: IpRateLimitRule, now = Date.now()): void {
    if (!this.config.ipRateLimitEnabled) {
      return;
    }

    const ipKey = clientIp ?? 'unknown';
    const bucketKey = `${rule.action}:${ipKey}`;
    const windowStart = now - rule.windowMs;
    const existing = this.buckets.get(bucketKey);
    const recent = (existing?.timestamps ?? []).filter((ts) => ts > windowStart);

    if (recent.length >= rule.maxRequests) {
      this.buckets.set(bucketKey, { timestamps: recent, windowMs: rule.windowMs });
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
      throw new AppHttpException(ErrorCode.RATE_LIMIT_EXCEEDED, {
        action: rule.action,
        limit: rule.maxRequests,
        windowSeconds: Math.round(rule.windowMs / 1000),
        retryAfterSeconds,
      });
    }

    recent.push(now);
    this.buckets.set(bucketKey, { timestamps: recent, windowMs: rule.windowMs });
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

    for (const [key, entry] of this.buckets) {
      const cutoff = now - entry.windowMs;
      if (entry.timestamps.every((ts) => ts <= cutoff)) {
        this.buckets.delete(key);
      }
    }
  }
}
