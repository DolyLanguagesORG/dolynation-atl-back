/**
 * Canonical error codes for the Dolynglish API.
 *
 * Every error returned to the client uses one of these codes. The string value
 * (not the TS enum number) is what the client sees, so we can add or rename
 * codes without breaking compatibility.
 *
 * Conventions:
 *   - 4xx codes = client did something wrong
 *   - 5xx codes = server side issue (the client did nothing wrong)
 *   - NEVER leak internal details (SQL strings, file paths, secrets) into the
 *     `message` field. The full error is logged server-side; the client gets
 *     a generic, safe message plus a stable code.
 */
export enum ErrorCode {
  // === Auth (4xx) ===
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_EMAIL_ALREADY_EXISTS = 'AUTH_EMAIL_ALREADY_EXISTS',
  AUTH_PASSWORD_TOO_WEAK = 'AUTH_PASSWORD_TOO_WEAK',
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',

  // === Resources (4xx) ===
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_FORBIDDEN = 'RESOURCE_FORBIDDEN',

  // === Readings domain (4xx) ===
  READING_PENDING_LIMIT_REACHED = 'READING_PENDING_LIMIT_REACHED',
  READING_ALREADY_EVALUATED = 'READING_ALREADY_EVALUATED',

  // === Validation (4xx) ===
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // === Server (5xx) ===
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface ErrorMeta {
  code: ErrorCode;
  /** HTTP status code, returned to the client. */
  status: number;
  /** Human-readable message, safe to expose. NEVER includes SQL, paths, or secrets. */
  message: string;
}

/**
 * Builder for ErrorMeta entries. Using a function (instead of inline object
 * literals) makes typescript-eslint accept the assignment: the parameter is
 * typed as the union ErrorCode, which the specific enum member satisfies.
 */
const entry = (code: ErrorCode, status: number, message: string): ErrorMeta => ({
  code,
  status,
  message,
});

/**
 * The full catalogue. Every ErrorCode MUST have an entry here.
 * Tests in error-codes.spec.ts assert this exhaustively.
 */
// The indexed access [ErrorCode.X]: entry(...) compares the enum member
// type with the Record key type. typescript-eslint flags this as
// no-unsafe-enum-comparison even though every entry IS keyed by its own
// ErrorCode value — a known false positive for string/numeric enums.
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

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_VALUES.includes(value as ErrorCode);
}

export function getErrorMeta(code: ErrorCode): ErrorMeta {
  return ErrorCatalog[code] ?? ErrorCatalog[ErrorCode.INTERNAL_ERROR];
}
