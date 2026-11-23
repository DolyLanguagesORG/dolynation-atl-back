import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { extractClientIp } from '../logs';
import { IP_RATE_LIMIT_KEY, type IpRateLimitRule } from './decorators/rate-limit-by-ip.decorator';
import { IpRateLimitService } from './ip-rate-limit.service';

/**
 * Guardia global que aplica `@RateLimitByIp(...)` sobre la IP real del cliente
 * antes de verificar Turnstile o ejecutar el controlador.
 */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ipRateLimit: IpRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<IpRateLimitRule | undefined>(IP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const clientIp = extractClientIp(req);
    this.ipRateLimit.assertWithinLimit(clientIp, rule);
    return true;
  }
}
