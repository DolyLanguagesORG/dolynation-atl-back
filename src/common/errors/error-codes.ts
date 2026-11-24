/**
 * Códigos de error canónicos para la API de Dolynglish.
 *
 * Cada error devuelto al cliente utiliza uno de estos códigos. El cliente recibe
 * el valor en texto (no un índice numérico) para mantener compatibilidad al agregar
 * o reorganizar códigos.
 *
 * Convenciones:
 *   - Códigos 4xx = error del cliente o de validación/permisos
 *   - Códigos 5xx = fallo del servidor o de dependencias externas
 *   - NUNCA filtrar detalles internos (SQL, rutas, secretos) en el campo `message`.
 */
export enum ErrorCode {
  // === Autenticación (4xx) ===
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_EMAIL_ALREADY_EXISTS = 'AUTH_EMAIL_ALREADY_EXISTS',
  AUTH_PASSWORD_TOO_WEAK = 'AUTH_PASSWORD_TOO_WEAK',
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
  AUTH_EMAIL_NOT_VERIFIED = 'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_EMAIL_TOKEN_INVALID = 'AUTH_EMAIL_TOKEN_INVALID',
  AUTH_PASSWORD_LOGIN_NOT_ALLOWED = 'AUTH_PASSWORD_LOGIN_NOT_ALLOWED',
  AUTH_OAUTH_NOT_CONFIGURED = 'AUTH_OAUTH_NOT_CONFIGURED',
  AUTH_OAUTH_UNSUPPORTED_PROVIDER = 'AUTH_OAUTH_UNSUPPORTED_PROVIDER',
  AUTH_OAUTH_INVALID_CODE = 'AUTH_OAUTH_INVALID_CODE',
  AUTH_OAUTH_EMAIL_UNVERIFIED = 'AUTH_OAUTH_EMAIL_UNVERIFIED',
  AUTH_OAUTH_ACCOUNT_LINK_REQUIRED = 'AUTH_OAUTH_ACCOUNT_LINK_REQUIRED',
  AUTH_OAUTH_ADMIN_FORBIDDEN = 'AUTH_OAUTH_ADMIN_FORBIDDEN',
  AUTH_OAUTH_PROVIDER_ERROR = 'AUTH_OAUTH_PROVIDER_ERROR',
  AUTH_OAUTH_STATE_INVALID = 'AUTH_OAUTH_STATE_INVALID',

  // === Recursos (4xx) ===
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_FORBIDDEN = 'RESOURCE_FORBIDDEN',

  // === Dominio de lecturas (4xx) ===
  READING_PENDING_LIMIT_REACHED = 'READING_PENDING_LIMIT_REACHED',
  READING_ALREADY_EVALUATED = 'READING_ALREADY_EVALUATED',
  READING_DAILY_LIMIT_REACHED = 'READING_DAILY_LIMIT_REACHED',
  EXPLANATION_DAILY_LIMIT_REACHED = 'EXPLANATION_DAILY_LIMIT_REACHED',

  // === Suscripciones e idiomas (4xx) ===
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_INVALID_TIER = 'SUBSCRIPTION_INVALID_TIER',
  SUBSCRIPTION_CATEGORY_LIMIT_EXCEEDED = 'SUBSCRIPTION_CATEGORY_LIMIT_EXCEEDED',
  SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED = 'SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED',
  SUBSCRIPTION_LANGUAGE_NOT_ALLOWED = 'SUBSCRIPTION_LANGUAGE_NOT_ALLOWED',
  LANGUAGE_NOT_SELECTED = 'LANGUAGE_NOT_SELECTED',
  LANGUAGE_CHANGE_LOCKED = 'LANGUAGE_CHANGE_LOCKED',

  // === Pagos y facturación (4xx/5xx) ===
  BILLING_PAYMENT_REQUIRED = 'BILLING_PAYMENT_REQUIRED',
  BILLING_CHECKOUT_INVALID = 'BILLING_CHECKOUT_INVALID',
  BILLING_WEBHOOK_SIGNATURE_INVALID = 'BILLING_WEBHOOK_SIGNATURE_INVALID',
  BILLING_SUBSCRIPTION_CONFLICT = 'BILLING_SUBSCRIPTION_CONFLICT',
  BILLING_PROVIDER_ERROR = 'BILLING_PROVIDER_ERROR',
  BILLING_NOT_CONFIGURED = 'BILLING_NOT_CONFIGURED',
  BILLING_RATE_LIMITED = 'BILLING_RATE_LIMITED',

  // === Solicitudes de acceso (4xx) ===
  ACCESS_REQUEST_REQUIRED = 'ACCESS_REQUEST_REQUIRED',
  ACCESS_REQUESTS_DISABLED = 'ACCESS_REQUESTS_DISABLED',
  ACCESS_REQUEST_ALREADY_PENDING = 'ACCESS_REQUEST_ALREADY_PENDING',
  ACCESS_REQUEST_ALREADY_REVIEWED = 'ACCESS_REQUEST_ALREADY_REVIEWED',

  // === Categorías y moderación (4xx) ===
  CATEGORY_MODERATION_REJECTED = 'CATEGORY_MODERATION_REJECTED',
  CATEGORY_DAILY_LIMIT_REACHED = 'CATEGORY_DAILY_LIMIT_REACHED',

  // === Validación (4xx) ===
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // === Seguridad anti-bot y rate limiting (4xx/5xx) ===
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  CAPTCHA_VERIFICATION_FAILED = 'CAPTCHA_VERIFICATION_FAILED',
  CAPTCHA_PROVIDER_UNAVAILABLE = 'CAPTCHA_PROVIDER_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // === Proveedor de IA (4xx: cuota del provider, no del usuario) ===
  AI_RATE_LIMITED = 'AI_RATE_LIMITED',
  AI_GENERATION_TIMEOUT = 'AI_GENERATION_TIMEOUT',

  // === Servidor (5xx) ===
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/** Metadatos asociados a cada código del catálogo de errores. */
export interface ErrorMeta {
  code: ErrorCode;
  /** Código de estado HTTP devuelto al cliente. */
  status: number;
  /** Mensaje legible seguro para exponer. Nunca incluye SQL, rutas ni secretos. */
  message: string;
}

/**
 * Constructor auxiliar de entradas `ErrorMeta`. Usar una función (en lugar de objetos
 * literales directos) hace que typescript-eslint acepte la asignación de enum.
 */
const entry = (code: ErrorCode, status: number, message: string): ErrorMeta => ({
  code,
  status,
  message,
});

/**
 * Catálogo completo de errores. Todo `ErrorCode` DEBE tener una entrada aquí;
 * las pruebas en `error-codes.spec.ts` verifican esta cobertura de forma exhaustiva.
 */
// El acceso indexado `[ErrorCode.X]: entry(...)` compara el miembro del enum
// con el tipo clave de `Record`. typescript-eslint marca esto como
// `no-unsafe-enum-comparison` aunque cada clave coincida con su propio `ErrorCode`.
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
export const ErrorCatalog: Record<ErrorCode, ErrorMeta> = {
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: entry(
    ErrorCode.AUTH_INVALID_CREDENTIALS,
    401,
    'Invalid email or password',
  ),
  [ErrorCode.AUTH_TOKEN_EXPIRED]: entry(
    ErrorCode.AUTH_TOKEN_EXPIRED,
    401,
    'Authentication token has expired',
  ),
  [ErrorCode.AUTH_TOKEN_INVALID]: entry(
    ErrorCode.AUTH_TOKEN_INVALID,
    401,
    'Authentication token is invalid',
  ),
  [ErrorCode.AUTH_EMAIL_ALREADY_EXISTS]: entry(
    ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
    409,
    'An account with that email already exists',
  ),
  [ErrorCode.AUTH_PASSWORD_TOO_WEAK]: entry(
    ErrorCode.AUTH_PASSWORD_TOO_WEAK,
    400,
    'Password does not meet the minimum strength requirements',
  ),
  [ErrorCode.AUTH_UNAUTHORIZED]: entry(
    ErrorCode.AUTH_UNAUTHORIZED,
    401,
    'Authentication is required to access this resource',
  ),
  [ErrorCode.AUTH_EMAIL_NOT_VERIFIED]: entry(
    ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
    403,
    'Your email address has not been confirmed yet. Please check your inbox and confirm it to continue.',
  ),
  [ErrorCode.AUTH_EMAIL_TOKEN_INVALID]: entry(
    ErrorCode.AUTH_EMAIL_TOKEN_INVALID,
    400,
    'This link is invalid, has expired or has already been used. Please request a new one.',
  ),
  [ErrorCode.AUTH_PASSWORD_LOGIN_NOT_ALLOWED]: entry(
    ErrorCode.AUTH_PASSWORD_LOGIN_NOT_ALLOWED,
    403,
    'This account was created with an OAuth provider. Continue with that provider to sign in.',
  ),
  [ErrorCode.AUTH_OAUTH_NOT_CONFIGURED]: entry(
    ErrorCode.AUTH_OAUTH_NOT_CONFIGURED,
    503,
    'OAuth sign-in is not configured for this provider on this environment',
  ),
  [ErrorCode.AUTH_OAUTH_UNSUPPORTED_PROVIDER]: entry(
    ErrorCode.AUTH_OAUTH_UNSUPPORTED_PROVIDER,
    400,
    'The requested OAuth provider is not supported',
  ),
  [ErrorCode.AUTH_OAUTH_INVALID_CODE]: entry(
    ErrorCode.AUTH_OAUTH_INVALID_CODE,
    400,
    'The OAuth authorization code is invalid or has expired. Please try again.',
  ),
  [ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED]: entry(
    ErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED,
    403,
    'Your OAuth provider account does not have a verified email address.',
  ),
  [ErrorCode.AUTH_OAUTH_ACCOUNT_LINK_REQUIRED]: entry(
    ErrorCode.AUTH_OAUTH_ACCOUNT_LINK_REQUIRED,
    409,
    'An account with this email already exists. Sign in with your password or link the OAuth provider from your profile.',
  ),
  [ErrorCode.AUTH_OAUTH_ADMIN_FORBIDDEN]: entry(
    ErrorCode.AUTH_OAUTH_ADMIN_FORBIDDEN,
    403,
    'Administrator accounts cannot sign in with external OAuth providers. Use email and password instead.',
  ),
  [ErrorCode.AUTH_OAUTH_PROVIDER_ERROR]: entry(
    ErrorCode.AUTH_OAUTH_PROVIDER_ERROR,
    502,
    'Could not complete authentication with the external OAuth provider. Please try again.',
  ),
  [ErrorCode.AUTH_OAUTH_STATE_INVALID]: entry(
    ErrorCode.AUTH_OAUTH_STATE_INVALID,
    400,
    'The OAuth sign-in session expired or is invalid. Please try again.',
  ),
  [ErrorCode.RESOURCE_NOT_FOUND]: entry(
    ErrorCode.RESOURCE_NOT_FOUND,
    404,
    'The requested resource was not found',
  ),
  [ErrorCode.RESOURCE_FORBIDDEN]: entry(
    ErrorCode.RESOURCE_FORBIDDEN,
    403,
    'You do not have permission to access this resource',
  ),
  [ErrorCode.READING_PENDING_LIMIT_REACHED]: entry(
    ErrorCode.READING_PENDING_LIMIT_REACHED,
    400,
    'You have reached the maximum number of pending readings. Complete or delete some before generating more.',
  ),
  [ErrorCode.READING_ALREADY_EVALUATED]: entry(
    ErrorCode.READING_ALREADY_EVALUATED,
    400,
    'This reading has already been evaluated and cannot be modified',
  ),
  [ErrorCode.READING_DAILY_LIMIT_REACHED]: entry(
    ErrorCode.READING_DAILY_LIMIT_REACHED,
    429,
    'You have reached your daily reading generation limit for today',
  ),
  [ErrorCode.EXPLANATION_DAILY_LIMIT_REACHED]: entry(
    ErrorCode.EXPLANATION_DAILY_LIMIT_REACHED,
    429,
    'You have reached your daily reading question limit for today',
  ),
  [ErrorCode.SUBSCRIPTION_REQUIRED]: entry(
    ErrorCode.SUBSCRIPTION_REQUIRED,
    403,
    'A subscription plan is required to perform this action. Please select a plan',
  ),
  [ErrorCode.SUBSCRIPTION_INVALID_TIER]: entry(
    ErrorCode.SUBSCRIPTION_INVALID_TIER,
    400,
    'The specified subscription plan is invalid.',
  ),
  [ErrorCode.SUBSCRIPTION_CATEGORY_LIMIT_EXCEEDED]: entry(
    ErrorCode.SUBSCRIPTION_CATEGORY_LIMIT_EXCEEDED,
    400,
    'You have exceeded the category limit for your subscription plan',
  ),
  [ErrorCode.SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED]: entry(
    ErrorCode.SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED,
    400,
    'You have exceeded the maximum number of languages allowed by your subscription plan',
  ),
  [ErrorCode.SUBSCRIPTION_LANGUAGE_NOT_ALLOWED]: entry(
    ErrorCode.SUBSCRIPTION_LANGUAGE_NOT_ALLOWED,
    403,
    'The requested language is not enabled in your active subscription language selection',
  ),
  [ErrorCode.LANGUAGE_NOT_SELECTED]: entry(
    ErrorCode.LANGUAGE_NOT_SELECTED,
    403,
    'You must select your learning languages in settings before generating readings',
  ),
  [ErrorCode.LANGUAGE_CHANGE_LOCKED]: entry(
    ErrorCode.LANGUAGE_CHANGE_LOCKED,
    403,
    'Your selected languages are locked. You can change them once per year or unlock an immediate change with a payment',
  ),
  [ErrorCode.BILLING_PAYMENT_REQUIRED]: entry(
    ErrorCode.BILLING_PAYMENT_REQUIRED,
    402,
    'Payment is required to complete this action. Please use the checkout flow.',
  ),
  [ErrorCode.BILLING_CHECKOUT_INVALID]: entry(
    ErrorCode.BILLING_CHECKOUT_INVALID,
    400,
    'The checkout session is invalid or cannot be processed',
  ),
  [ErrorCode.BILLING_WEBHOOK_SIGNATURE_INVALID]: entry(
    ErrorCode.BILLING_WEBHOOK_SIGNATURE_INVALID,
    400,
    'Invalid webhook signature',
  ),
  [ErrorCode.BILLING_SUBSCRIPTION_CONFLICT]: entry(
    ErrorCode.BILLING_SUBSCRIPTION_CONFLICT,
    409,
    'An active paid subscription already exists. Use the plan change flow instead.',
  ),
  [ErrorCode.BILLING_PROVIDER_ERROR]: entry(
    ErrorCode.BILLING_PROVIDER_ERROR,
    502,
    'The payment provider could not complete the request. Please try again.',
  ),
  [ErrorCode.BILLING_NOT_CONFIGURED]: entry(
    ErrorCode.BILLING_NOT_CONFIGURED,
    503,
    'Payment billing is not configured on this environment',
  ),
  [ErrorCode.BILLING_RATE_LIMITED]: entry(
    ErrorCode.BILLING_RATE_LIMITED,
    429,
    'Too many billing requests. Please wait a moment and try again.',
  ),
  [ErrorCode.ACCESS_REQUEST_REQUIRED]: entry(
    ErrorCode.ACCESS_REQUEST_REQUIRED,
    403,
    'Direct activation is disabled. Please submit an access request for administrator approval.',
  ),
  [ErrorCode.ACCESS_REQUESTS_DISABLED]: entry(
    ErrorCode.ACCESS_REQUESTS_DISABLED,
    403,
    'Manual access requests are currently disabled.',
  ),
  [ErrorCode.ACCESS_REQUEST_ALREADY_PENDING]: entry(
    ErrorCode.ACCESS_REQUEST_ALREADY_PENDING,
    409,
    'You already have a pending request of this type awaiting administrator review.',
  ),
  [ErrorCode.ACCESS_REQUEST_ALREADY_REVIEWED]: entry(
    ErrorCode.ACCESS_REQUEST_ALREADY_REVIEWED,
    409,
    'This access request has already been reviewed and cannot be modified.',
  ),
  [ErrorCode.CATEGORY_MODERATION_REJECTED]: entry(
    ErrorCode.CATEGORY_MODERATION_REJECTED,
    400,
    'One or more categories were rejected by content moderation',
  ),
  [ErrorCode.CATEGORY_DAILY_LIMIT_REACHED]: entry(
    ErrorCode.CATEGORY_DAILY_LIMIT_REACHED,
    429,
    'Daily limit for adding or evaluating new custom categories has been reached. Try again tomorrow.',
  ),
  [ErrorCode.VALIDATION_ERROR]: entry(
    ErrorCode.VALIDATION_ERROR,
    400,
    'Some of the submitted information is invalid. Please check your input.',
  ),
  [ErrorCode.CAPTCHA_REQUIRED]: entry(
    ErrorCode.CAPTCHA_REQUIRED,
    400,
    'Human verification is required to complete this request.',
  ),
  [ErrorCode.CAPTCHA_VERIFICATION_FAILED]: entry(
    ErrorCode.CAPTCHA_VERIFICATION_FAILED,
    403,
    'Human verification failed or expired. Please try again.',
  ),
  [ErrorCode.CAPTCHA_PROVIDER_UNAVAILABLE]: entry(
    ErrorCode.CAPTCHA_PROVIDER_UNAVAILABLE,
    503,
    'Verification service is temporarily unavailable. Please try again shortly.',
  ),
  [ErrorCode.RATE_LIMIT_EXCEEDED]: entry(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    429,
    'Too many requests. Please wait a moment and try again.',
  ),
  [ErrorCode.INTERNAL_ERROR]: entry(
    ErrorCode.INTERNAL_ERROR,
    500,
    'An unexpected error occurred. Please try again later.',
  ),
  [ErrorCode.SERVICE_UNAVAILABLE]: entry(
    ErrorCode.SERVICE_UNAVAILABLE,
    503,
    'The service is temporarily unavailable. Please try again later.',
  ),
  [ErrorCode.AI_RATE_LIMITED]: entry(
    ErrorCode.AI_RATE_LIMITED,
    429,
    'The service is experiencing high demand. Please try again in a few minutes.',
  ),
  [ErrorCode.AI_GENERATION_TIMEOUT]: entry(
    ErrorCode.AI_GENERATION_TIMEOUT,
    504,
    'The generation took too long and was cancelled. Nothing was saved or charged; please try again.',
  ),
};
/* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */

/** Valores del enum usados para validar de forma segura códigos desconocidos en tiempo de ejecución. */
const ERROR_CODE_VALUES: ErrorCode[] = Object.values(ErrorCode);

/** Valida si un valor desconocido corresponde a un `ErrorCode` reconocido. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_VALUES.includes(value as ErrorCode);
}

/** Obtiene los metadatos HTTP de un código de error, usando `INTERNAL_ERROR` como respaldo. */
export function getErrorMeta(code: ErrorCode): ErrorMeta {
  return ErrorCatalog[code] ?? ErrorCatalog[ErrorCode.INTERNAL_ERROR];
}
