import { HttpException, HttpStatus } from '@nestjs/common';
import { type ErrorCode, getErrorMeta } from './error-codes';

/**
 * Domain exception that carries a stable ErrorCode so the global filter
 * can render a consistent envelope.
 *
 * Use this instead of `new NotFoundException('...')` etc. so that the API
 * contract uses a documented code (and never leaks the original message
 * to clients when the error is server-side).
 */
export class AppHttpException extends HttpException {
  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    const meta = getErrorMeta(code);
    // Pass the public message + code + details in the body. The filter reads
    // them and renders the final envelope, but NestJS's built-in exception
    // log (which runs before our filter) also reads them, so we include
    // everything the consumer might want.
    const body: { code: ErrorCode; message: string; details?: Record<string, unknown> } = {
      code: meta.code,
      message: meta.message,
    };
    if (details !== undefined) {
      body.details = details;
    }
    super(body, meta.status);
    this.name = 'AppHttpException';
  }
}

/**
 * Helper to keep the existing call sites readable.
 *   throw httpError(ErrorCode.RESOURCE_NOT_FOUND, { id: 42 });
 */
export const httpError = (code: ErrorCode, details?: Record<string, unknown>): AppHttpException =>
  new AppHttpException(code, details);

// Re-export HttpStatus for controllers that still need it.
export { HttpStatus };
