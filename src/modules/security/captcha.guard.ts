import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { extractClientIp } from '../logs';
import { CAPTCHA_TOKEN_HEADER, type CaptchaAction } from './captcha.constants';
import { CaptchaService } from './captcha.service';
import { REQUIRE_CAPTCHA_KEY } from './decorators/require-captcha.decorator';

function readCaptchaHeader(headers: Request['headers']): string | undefined {
  const raw = headers[CAPTCHA_TOKEN_HEADER];
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string') {
    return raw[0];
  }
  return undefined;
}

/**
 * Guardia global anti-bot para rutas anotadas con `@RequireCaptcha(action)`.
 *
 * Se ejecuta después de `JwtAuthGuard` y `SubscriptionGuard` para no consumir
 * tokens Turnstile de un solo uso cuando una petición falla por JWT expirado (`401`).
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly captcha: CaptchaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<CaptchaAction | undefined>(
      REQUIRE_CAPTCHA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const token = readCaptchaHeader(req.headers);
    const clientIp = extractClientIp(req);

    await this.captcha.verifyToken({
      token,
      expectedAction: action,
      clientIp,
    });

    return true;
  }
}
