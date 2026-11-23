import { SetMetadata } from '@nestjs/common';

export const IP_RATE_LIMIT_KEY = 'security:ip_rate_limit';

/** Regla de limitación por IP real de cliente para endpoints sensibles o públicos. */
export interface IpRateLimitRule {
  action: string;
  maxRequests: number;
  windowMs: number;
}

/**
 * Aplica limitación de peticiones en ventana deslizante por IP real de cliente
 * (`CF-Connecting-IP` > `X-Real-IP` > `X-Forwarded-For` > `req.ip`).
 */
export const RateLimitByIp = (rule: IpRateLimitRule): MethodDecorator =>
  SetMetadata(IP_RATE_LIMIT_KEY, rule);
