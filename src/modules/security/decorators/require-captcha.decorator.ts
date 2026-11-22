import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { CAPTCHA_TOKEN_HEADER, type CaptchaAction } from '../captcha.constants';

export const REQUIRE_CAPTCHA_KEY = 'security:require_captcha';

/**
 * Exige un token anti-bot válido en la cabecera `X-Captcha-Token` vinculado a `action`
 * cuando `CAPTCHA_PROVIDER=turnstile` está habilitado en el entorno.
 */
export const RequireCaptcha = (action: CaptchaAction): MethodDecorator =>
  applyDecorators(
    SetMetadata(REQUIRE_CAPTCHA_KEY, action),
    ApiHeader({
      name: CAPTCHA_TOKEN_HEADER,
      required: false,
      description: `Token de Cloudflare Turnstile para la acción "${action}" (obligatorio cuando CAPTCHA_PROVIDER=turnstile)`,
    }),
  );
