import { ErrorCode, ErrorCatalog, getErrorMeta, isErrorCode } from './error-codes';

describe('ErrorCode catalogue', () => {
  it('every code has a stable string identifier (no enum leaks to clients)', () => {
    for (const code of Object.values(ErrorCode)) {
      const str = String(code);
      expect(str).toMatch(/^[A-Z][A-Z0-9_]+$/);
      // Must not be a TypeScript numeric value
      expect(Number.isNaN(Number(str))).toBe(true);
    }
  });

  it('exposes the user-facing codes documented in the spec', () => {
    const required = [
      // Auth (4xx)
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_TOKEN_EXPIRED',
      'AUTH_TOKEN_INVALID',
      'AUTH_EMAIL_ALREADY_EXISTS',
      'AUTH_PASSWORD_TOO_WEAK',
      // Resource
      'RESOURCE_NOT_FOUND',
      'RESOURCE_FORBIDDEN',
      'READING_PENDING_LIMIT_REACHED',
      'READING_ALREADY_EVALUATED',
      // Validation
      'VALIDATION_ERROR',
      // Server
      'INTERNAL_ERROR',
      'SERVICE_UNAVAILABLE',
    ];
    for (const name of required) {
      expect(Object.values(ErrorCode)).toContain(name);
    }
  });

  it('isErrorCode is true for known codes, false for random strings', () => {
    expect(isErrorCode('AUTH_INVALID_CREDENTIALS')).toBe(true);
    expect(isErrorCode('RESOURCE_NOT_FOUND')).toBe(true);
    expect(isErrorCode('not_a_code')).toBe(false);
    expect(isErrorCode('')).toBe(false);
  });
});

describe('ErrorCatalog', () => {
  it('every code in the enum has a metadata entry', () => {
    for (const code of Object.values(ErrorCode)) {
      const meta = ErrorCatalog[code];
      expect(meta).toBeDefined();
      expect(meta.code).toBe(code);
    }
  });

  it('every metadata entry has a stable http status', () => {
    for (const code of Object.values(ErrorCode)) {
      const meta = ErrorCatalog[code];
      expect(typeof meta.status).toBe('number');
      expect(meta.status).toBeGreaterThanOrEqual(400);
      expect(meta.status).toBeLessThan(600);
    }
  });

  it('every metadata entry has a human-readable message that does not leak internals', () => {
    for (const code of Object.values(ErrorCode)) {
      const meta = ErrorCatalog[code];
      expect(typeof meta.message).toBe('string');
      expect(meta.message.length).toBeGreaterThan(0);
      // Messages must NOT leak internal details. The word "password" is
      // legitimate in messages like "Invalid email or password", so we only
      // check for things that are NEVER safe to expose: SQL strings, file
      // paths, URLs with credentials.
      expect(meta.message).not.toMatch(/postgres:\/\//i);
      expect(meta.message).not.toMatch(/mysql:\/\//i);
      expect(meta.message).not.toMatch(/mongodb:\/\//i);
      expect(meta.message).not.toMatch(/:\/\/[^/\s]+:[^/\s]+@/); // credentials in URL
      expect(meta.message).not.toMatch(/\/app\//);
      expect(meta.message).not.toMatch(/\.(ts|js):\d+:\d+/); // stack frames
      expect(meta.message).not.toMatch(/at\s+\w+\s+\(/); // stack frame marker
    }
  });

  it('auth errors map to 4xx, never 5xx', () => {
    const authCodes: ErrorCode[] = [
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      ErrorCode.AUTH_TOKEN_EXPIRED,
      ErrorCode.AUTH_TOKEN_INVALID,
      ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
      ErrorCode.AUTH_PASSWORD_TOO_WEAK,
    ];
    for (const code of authCodes) {
      expect(ErrorCatalog[code].status).toBeGreaterThanOrEqual(400);
      expect(ErrorCatalog[code].status).toBeLessThan(500);
    }
  });

  it('INTERNAL_ERROR maps to 500', () => {
    expect(ErrorCatalog[ErrorCode.INTERNAL_ERROR].status).toBe(500);
  });
});

describe('getErrorMeta', () => {
  it('returns metadata for a known code', () => {
    const meta = getErrorMeta(ErrorCode.AUTH_INVALID_CREDENTIALS);
    expect(meta.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    expect(meta.status).toBe(401);
  });

  it('falls back to INTERNAL_ERROR for an unknown string', () => {
    const meta = getErrorMeta('UNKNOWN_CODE_xyz' as unknown as ErrorCode);
    expect(meta.code).toBe(ErrorCode.INTERNAL_ERROR);
  });
});
