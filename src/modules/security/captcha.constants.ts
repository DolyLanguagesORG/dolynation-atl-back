/** Cabecera HTTP canónica donde los clientes envían el token de verificación anti-bot. */
export const CAPTCHA_TOKEN_HEADER = 'x-captcha-token';

/** Longitud máxima razonable para tokens emitidos por Cloudflare Turnstile. */
export const CAPTCHA_MAX_TOKEN_LENGTH = 2048;

/** Acciones estándar de verificación anti-bot en DolyNation. */
export const CAPTCHA_ACTIONS = {
  REGISTER: 'register',
  LOGIN: 'login',
  FORGOT_PASSWORD: 'forgot_password',
  RESEND_VERIFICATION: 'resend_verification',
  RESET_PASSWORD: 'reset_password',
  BILLING_CHECKOUT: 'billing_checkout',
  BILLING_SETUP_INTENT: 'billing_setup_intent',
  SUBSCRIPTION_SELECT: 'subscription_select',
  ACCESS_REQUEST: 'access_request',
  READING_GENERATE: 'reading_generate',
  IA_CHAT: 'ia_chat',
} as const;

export type CaptchaAction = (typeof CAPTCHA_ACTIONS)[keyof typeof CAPTCHA_ACTIONS] | (string & {});

/** Secretos de prueba oficiales publicados por Cloudflare Turnstile. */
export const CLOUDFLARE_DUMMY_SECRETS = new Set<string>([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);
