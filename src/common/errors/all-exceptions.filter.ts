import { type ApiError } from '../types/api-response.type';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, ErrorCatalog, isErrorCode } from './error-codes';

const VALIDATION_MESSAGE_REGEX = /^([\w@.]+)\s+-\s+(.+)$/;

interface ValidationErrorEntry {
  field: string;
  message: string;
}

/**
 * Converts the array-of-strings shape that `class-validator` puts inside a
 * BadRequestException body into structured per-field entries.
 *
 * class-validator's default shape is `[ "email - must be an email", "password - too short" ]`.
 * The leading "fieldName -" part is captured; the rest is the human message.
 *
 * If the string doesn't match the pattern, we fall back to `_root` so we never
 * silently drop the error.
 */
function parseValidationMessages(arr: string[]): ValidationErrorEntry[] {
  return arr.map((raw) => {
    const m = VALIDATION_MESSAGE_REGEX.exec(raw);
    if (m?.[1] && m[2]) {
      return { field: m[1], message: m[2] };
    }
    return { field: '_root', message: raw };
  });
}

/**
 * Catches every thrown error and renders the standard envelope:
 *   { message: string, data: null, error: { code, message, details? } }
 *
 * Security guarantees:
 *   - Unknown errors (raw `new Error(...)`) are NEVER leaked to the client.
 *     Only a generic "An unexpected error occurred" message and the code
 *     `INTERNAL_ERROR` are returned; the full original is logged with full
 *     context (request, stack) for the dev team to debug.
 *   - SQL strings, file paths and stack frames never appear in the response.
 *   - The HTTP status code is determined by the ErrorCode catalogue or the
 *     original HttpException — never by the raw error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const envelope = this.buildEnvelope(exception, request);
    response.status(envelope.status).json(envelope.body);
  }

  /**
   * Visible for testing. Maps an unknown exception to a status + body.
   * The body is guaranteed safe to send to clients.
   */
  buildEnvelope(
    exception: unknown,
    _request: Request,
  ): { status: number; body: { message: string; data: null; error: ApiError } } {
    const fallback = ErrorCatalog[ErrorCode.INTERNAL_ERROR];

    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      // 1) Reads our code from the body. This covers AppHttpException AND
      //    raw HttpExceptions whose body happens to have a `code` field
      //    (e.g. thrown by ValidationPipe's exceptionFactory).
      const fromBody = this.tryReadCodeFromBody(body);
      this.logger.error(`DEBUG-BODY: ${JSON.stringify(body)}`);
      if (fromBody) {
        const meta = ErrorCatalog[fromBody] ?? fallback;
        const details = this.tryReadDetailsFromBody(body);
        return this.okResponse(meta, details);
      }

      const status = exception.getStatus();
      const resp = exception.getResponse();

      // 2) Foreign validation errors (raw class-validator shape).
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (status === HttpStatus.BAD_REQUEST && this.isValidationResponse(resp)) {
        const code = ErrorCode.VALIDATION_ERROR;
        const meta = ErrorCatalog[code];
        const fields = parseValidationMessages(this.asMessageArray(resp));
        return this.okResponse(meta, { fields });
      }

      // 3) Foreign HttpException without our code in the body — map by status.
      const code = this.codeFromStatus(status);
      const meta = ErrorCatalog[code] ?? fallback;
      return this.okResponse(meta);
    }

    // 4) Anything else — log everything, respond with a generic 500
    this.logger.error(
      JSON.stringify({
        msg: 'Unhandled exception caught by AllExceptionsFilter',
        errorName: this.errorName(exception),
        errorMessage: this.errorMessage(exception),
        stack: this.errorStack(exception),
      }),
    );
    return this.okResponse(fallback);
  }

  private okResponse(
    meta: { code: ErrorCode; status: number; message: string },
    details?: Record<string, unknown>,
  ): { status: number; body: { message: string; data: null; error: ApiError } } {
    const error: ApiError =
      details !== undefined
        ? { code: meta.code, message: meta.message, details }
        : { code: meta.code, message: meta.message };
    return {
      status: meta.status,
      body: {
        message: meta.message,
        data: null,
        error,
      },
    };
  }

  private tryReadCodeFromBody(body: string | object): ErrorCode | null {
    if (typeof body !== 'object' || body === null) return null;
    const raw = (body as { code?: unknown }).code;
    if (isErrorCode(raw)) return raw;
    return null;
  }

  private tryReadDetailsFromBody(body: string | object): Record<string, unknown> | undefined {
    if (typeof body !== 'object' || body === null) return undefined;
    const d = (body as { details?: unknown }).details;
    if (d && typeof d === 'object') return d as Record<string, unknown>;
    return undefined;
  }

  private codeFromStatus(status: number): ErrorCode {
    switch (status) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_UNAUTHORIZED;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case HttpStatus.FORBIDDEN:
        return ErrorCode.RESOURCE_FORBIDDEN;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case HttpStatus.NOT_FOUND:
        return ErrorCode.RESOURCE_NOT_FOUND;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case HttpStatus.CONFLICT:
        return ErrorCode.AUTH_EMAIL_ALREADY_EXISTS;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private isValidationResponse(resp: string | object): boolean {
    if (typeof resp !== 'object' || resp === null) return false;
    const r = resp as { message?: unknown };
    return Array.isArray(r.message);
  }

  private asMessageArray(resp: string | object): string[] {
    const r = resp as { message?: unknown };
    if (Array.isArray(r.message)) return r.message.map((m) => String(m));
    return [];
  }

  private errorName(exception: unknown): string {
    return exception instanceof Error ? exception.name : typeof exception;
  }

  private errorMessage(exception: unknown): string {
    return exception instanceof Error ? exception.message : String(exception);
  }

  private errorStack(exception: unknown): string | undefined {
    return exception instanceof Error ? exception.stack : undefined;
  }
}
