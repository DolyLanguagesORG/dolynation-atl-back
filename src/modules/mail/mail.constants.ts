/**
 * Constantes del servicio de correo transaccional.
 *
 * Los TTL de los tokens viven aquí (y no en variables de entorno) para no
 * agrandar la superficie de configuración: son política interna del producto,
 * no un parámetro que cada ambiente necesite ajustar.
 */

/** Tipo de token de correo: confirmación de la cuenta. */
export const EMAIL_TOKEN_TYPE_VERIFICATION = 'email_verification';

/** Tipo de token de correo: restablecimiento de contraseña. */
export const EMAIL_TOKEN_TYPE_PASSWORD_RESET = 'password_reset';

/** Union de los tipos de token de correo soportados. */
export type EmailTokenType =
  typeof EMAIL_TOKEN_TYPE_VERIFICATION | typeof EMAIL_TOKEN_TYPE_PASSWORD_RESET;

/** Vigencia del token de confirmación de cuenta: 24 horas. */
export const EMAIL_VERIFICATION_TTL_MINUTES = 60 * 24;

/** Vigencia del token de restablecimiento de contraseña: 60 minutos. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/** Ruta del frontend que consume el token de confirmación de cuenta. */
export const FRONTEND_VERIFY_EMAIL_PATH = '/verify-email';

/** Ruta del frontend que consume el token de restablecimiento de contraseña. */
export const FRONTEND_RESET_PASSWORD_PATH = '/reset-password';

/**
 * Límite de solicitudes de restablecimiento por dirección de correo dentro de
 * la ventana de `FORGOT_PASSWORD_THROTTLE_WINDOW_MS`.
 *
 * Mitiga el abuso del endpoint (email bombing). Es *best effort*: vive en
 * memoria del proceso, así que no sobrevive a un reinicio ni se comparte entre
 * instancias. La brecha global de rate limiting sigue abierta (ver
 * `docs/conventions/security.md`).
 */
export const FORGOT_PASSWORD_THROTTLE_MAX_REQUESTS = 3;

/** Ventana temporal del limitador de solicitudes: 15 minutos. */
export const FORGOT_PASSWORD_THROTTLE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Construye la URL pública del frontend que usa un correo.
 *
 * @param baseUrl Base pública del frontend (`FRONTEND_BASE_URL`).
 * @param path Ruta dentro del frontend.
 * @param params Parámetros de query que se anexan a la URL.
 */
export function buildFrontendUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string> = {},
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const entries = Object.entries(params).filter(([, value]) => value.length > 0);
  if (entries.length === 0) {
    return `${base}${suffix}`;
  }
  const query = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${base}${suffix}?${query}`;
}
