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

  // === Categorías y moderación (4xx) ===
  CATEGORY_MODERATION_REJECTED = 'CATEGORY_MODERATION_REJECTED',
  CATEGORY_DAILY_LIMIT_REACHED = 'CATEGORY_DAILY_LIMIT_REACHED',

  // === Validación (4xx) ===
  VALIDATION_ERROR = 'VALIDATION_ERROR',

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
    'The specified subscription plan is invalid. Choose one of: dolly, dolly_plus, dolly_pro',
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
    'The request data did not pass validation. See details for the specific fields.',
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
};
/* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */

const ERROR_CODE_VALUES: ErrorCode[] = Object.values(ErrorCode);

/** Valida si un valor desconocido corresponde a un `ErrorCode` reconocido. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_VALUES.includes(value as ErrorCode);
}

/** Obtiene los metadatos HTTP de un código de error, usando `INTERNAL_ERROR` como respaldo. */
export function getErrorMeta(code: ErrorCode): ErrorMeta {
  return ErrorCatalog[code] ?? ErrorCatalog[ErrorCode.INTERNAL_ERROR];
}
