import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '../../config/env.config';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AuditLogService } from '../logs';
import {
  CAPTCHA_MAX_TOKEN_LENGTH,
  CLOUDFLARE_DUMMY_SECRETS,
  type CaptchaAction,
} from './captcha.constants';
import type { CaptchaConfigResponseDto } from './dto/captcha-config-response.dto';

export interface VerifyCaptchaInput {
  token: string | undefined;
  expectedAction: CaptchaAction;
  clientIp: string | null;
}

interface TurnstileVerifyPayload {
  success: boolean;
  action: string;
  hostname: string;
  errorCodes: string[];
}

function parseTurnstileVerifyPayload(raw: unknown): TurnstileVerifyPayload {
  if (!raw || typeof raw !== 'object') {
    return { success: false, action: '', hostname: '', errorCodes: [] };
  }
  const record = raw as Record<string, unknown>;
  const rawErrorCodes = record['error-codes'];
  return {
    success: record['success'] === true,
    action: typeof record['action'] === 'string' ? record['action'].trim() : '',
    hostname: typeof record['hostname'] === 'string' ? record['hostname'].trim().toLowerCase() : '',
    errorCodes: Array.isArray(rawErrorCodes) ? rawErrorCodes.map((entry) => String(entry)) : [],
  };
}

/**
 * Servicio de verificación anti-bot con Cloudflare Turnstile (`siteverify`).
 *
 * Valida criptográficamente el token recibido desde `X-Captcha-Token` contra el
 * endpoint oficial de Cloudflare, verificando además la acción esperada (`action`)
 * y el hostname permitido para impedir reutilización o intercambio de tokens entre rutas.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(
    private readonly config: AppConfigService,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

  /** Devuelve la configuración pública segura para que el frontend inicialice Turnstile en runtime. */
  getPublicConfig(): CaptchaConfigResponseDto {
    const cfg = this.config.captcha;
    return {
      enabled: cfg.enabled,
      provider: cfg.enabled ? cfg.provider : 'disabled',
      siteKey: cfg.enabled && cfg.siteKey ? cfg.siteKey : null,
      appearance: cfg.appearance,
    };
  }

  /**
   * Verifica un token Turnstile contra Cloudflare `siteverify` cuando el proveedor está activo.
   * Nunca registra el token ni `CAPTCHA_SECRET_KEY` en logs.
   */
  async verifyToken(input: VerifyCaptchaInput): Promise<void> {
    const cfg = this.config.captcha;
    if (!cfg.enabled || !cfg.secretKey) {
      return;
    }

    const trimmedToken = typeof input.token === 'string' ? input.token.trim() : '';
    if (trimmedToken.length === 0 || trimmedToken.length > CAPTCHA_MAX_TOKEN_LENGTH) {
      await this.auditEvent('security.captcha_missing', {
        expectedAction: input.expectedAction,
        reason: trimmedToken.length === 0 ? 'missing' : 'too_long',
      });
      throw new AppHttpException(ErrorCode.CAPTCHA_REQUIRED, {
        action: input.expectedAction,
      });
    }

    let response: Response;
    try {
      response = await fetch(cfg.verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: cfg.secretKey,
          response: trimmedToken,
          ...(input.clientIp ? { remoteip: input.clientIp } : {}),
          idempotency_key: randomUUID(),
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (error) {
      await this.handleProviderError(
        cfg.failOpen,
        input.expectedAction,
        error instanceof Error ? error.name : 'network_error',
        null,
      );
      return;
    }

    if (!response.ok) {
      await this.handleProviderError(
        cfg.failOpen,
        input.expectedAction,
        'http_error',
        response.status,
      );
      return;
    }

    let parsedRaw: unknown;
    try {
      parsedRaw = await response.json();
    } catch {
      await this.handleProviderError(
        cfg.failOpen,
        input.expectedAction,
        'invalid_json',
        response.status,
      );
      return;
    }

    const payload = parseTurnstileVerifyPayload(parsedRaw);
    const isDummySecret = CLOUDFLARE_DUMMY_SECRETS.has(cfg.secretKey);

    const actionMatches = isDummySecret
      ? payload.action.length === 0 || payload.action === input.expectedAction
      : payload.action === input.expectedAction;

    const hostnameMatches =
      cfg.allowedHostnames.length === 0
        ? true
        : isDummySecret && payload.hostname === 'example.com'
          ? true
          : cfg.allowedHostnames.includes(payload.hostname);

    if (!payload.success || !actionMatches || !hostnameMatches) {
      const reason = !payload.success
        ? 'provider_rejected'
        : !actionMatches
          ? 'action_mismatch'
          : 'hostname_mismatch';

      await this.auditEvent('security.captcha_rejected', {
        expectedAction: input.expectedAction,
        returnedAction: payload.action.length > 0 ? payload.action : null,
        hostname: payload.hostname.length > 0 ? payload.hostname : null,
        errorCodes: payload.errorCodes,
        reason,
      });

      throw new AppHttpException(ErrorCode.CAPTCHA_VERIFICATION_FAILED, {
        action: input.expectedAction,
      });
    }
  }

  private async handleProviderError(
    failOpen: boolean,
    expectedAction: CaptchaAction,
    reason: string,
    statusCode: number | null,
  ): Promise<void> {
    await this.auditEvent('security.captcha_provider_error', {
      expectedAction,
      reason,
      statusCode,
      failOpen,
    });

    if (failOpen) {
      this.logger.warn(
        `Turnstile siteverify unavailable (${reason}); allowing request because CAPTCHA_FAIL_OPEN=true`,
      );
      return;
    }

    throw new AppHttpException(ErrorCode.CAPTCHA_PROVIDER_UNAVAILABLE, {
      action: expectedAction,
    });
  }

  private async auditEvent(event: string, metadata: Record<string, unknown>): Promise<void> {
    await this.auditLogs?.logEvent({
      module: 'security',
      action: 'ACTION',
      event,
      summary: `Security check: ${event}`,
      metadata,
    });
  }
}
