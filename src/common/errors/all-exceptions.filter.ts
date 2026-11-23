import { type ApiError } from '../types/api-response.type';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, ErrorCatalog, isErrorCode } from './error-codes';
import { ErrorLogService, RequestContextService } from '../../modules/logs';

/** Reconoce el formato `campo - mensaje` usado por los errores de validación. */
const VALIDATION_MESSAGE_REGEX = /^([\w@.]+)\s+-\s+(.+)$/;

/** Detalles internos que no deben filtrarse en el sobre de error público. */
const INTERNAL_DETAIL_KEYS = new Set([
  'hint',
  'operation',
  'reason',
  'existingRequestId',
  'userCategories',
  'validTiers',
  'allowedLanguages',
  'message',
]);

/** Elimina de la respuesta pública los detalles reservados para uso interno. */
function stripInternalDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const filteredEntries = Object.entries(details).filter(([key]) => !INTERNAL_DETAIL_KEYS.has(key));
  if (filteredEntries.length === 0) return undefined;
  return Object.fromEntries(filteredEntries);
}

interface ValidationErrorEntry {
  field: string;
  message: string;
}

/**
 * Convierte el arreglo de cadenas que `class-validator` coloca dentro de una
 * `BadRequestException` en entradas estructuradas por campo.
 *
 * El formato esperado por defecto es `["email - must be an email", "password - too short"]`.
 * Captura el prefijo `"nombreCampo -"` y conserva el resto como mensaje legible.
 * Si no coincide con el patrón, lo agrupa bajo `_root` para no perder ningún detalle.
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
 * Filtro global que captura cualquier excepción lanzada y devuelve el sobre estándar:
 *   `{ message: string, data: null, error: { code, message, details? } }`
 *
 * Garantías de seguridad:
 *   - Los errores desconocidos (`new Error(...)`) NUNCA se filtran al cliente.
 *     Solo se devuelve el mensaje genérico de `INTERNAL_ERROR`; el error original
 *     completo se registra en logs del servidor para depuración.
 *   - Consultas SQL, rutas de archivos y stack traces jamás aparecen en la respuesta.
 *   - El código HTTP lo define el catálogo `ErrorCatalog` o la `HttpException` original.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Optional() private readonly errorLogs?: ErrorLogService,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  /** Intercepta la excepción del contexto HTTP, la registra en Pino/BD y escribe el sobre seguro. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const envelope = this.buildEnvelope(exception, request);
    this.requestContext?.setHttpStatus(envelope.status);
    void this.errorLogs?.logHttpException(exception, request, envelope);

    const sanitizedDetails = stripInternalDetails(envelope.body.error.details);
    const publicError: ApiError =
      sanitizedDetails !== undefined
        ? {
            code: envelope.body.error.code,
            message: envelope.body.error.message,
            details: sanitizedDetails,
          }
        : {
            code: envelope.body.error.code,
            message: envelope.body.error.message,
          };

    response.status(envelope.status).json({
      message: envelope.body.message,
      data: null,
      error: publicError,
    });
  }

  /**
   * Visible para pruebas unitarias. Convierte una excepción arbitraria en un estado HTTP
   * y un cuerpo seguro para enviar al cliente.
   */
  buildEnvelope(
    exception: unknown,
    _request: Request,
  ): { status: number; body: { message: string; data: null; error: ApiError } } {
    const fallback = ErrorCatalog[ErrorCode.INTERNAL_ERROR];

    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      // 1) Lee nuestro código de error desde el cuerpo. Cubre AppHttpException y
      //    HttpExceptions con campo `code` propio (p. ej. lanzadas por ValidationPipe).
      const fromBody = this.tryReadCodeFromBody(body);
      if (fromBody) {
        const meta = ErrorCatalog[fromBody] ?? fallback;
        const details = this.tryReadDetailsFromBody(body);
        return this.okResponse(meta, details);
      }

      const status = exception.getStatus();
      const resp = exception.getResponse();

      // 2) Errores de validación externos (formato estándar de class-validator).
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (status === HttpStatus.BAD_REQUEST && this.isValidationResponse(resp)) {
        const code = ErrorCode.VALIDATION_ERROR;
        const meta = ErrorCatalog[code];
        const fields = parseValidationMessages(this.asMessageArray(resp));
        return this.okResponse(meta, { fields });
      }

      // 3) HttpException externa sin código propio en el cuerpo: se mapea por código HTTP.
      const code = this.codeFromStatus(status);
      const meta = ErrorCatalog[code] ?? fallback;
      return this.okResponse(meta);
    }

    // 4) Cualquier otro error no controlado: si no hay ErrorLogService inyectado, se registra directo aquí.
    if (!this.errorLogs) {
      this.logger.error(
        JSON.stringify({
          msg: 'Unhandled exception caught by AllExceptionsFilter',
          errorName: this.errorName(exception),
          errorMessage: this.errorMessage(exception),
          stack: this.errorStack(exception),
        }),
      );
    }
    return this.okResponse(fallback);
  }

  /** Construye el sobre de error seguro y conserva el estado HTTP del catálogo. */
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

  /** Obtiene del cuerpo una clave de error reconocida por el catálogo de la API. */
  private tryReadCodeFromBody(body: string | object): ErrorCode | null {
    if (typeof body !== 'object' || body === null) return null;
    const raw = (body as { code?: unknown }).code;
    if (isErrorCode(raw)) return raw;
    return null;
  }

  /** Extrae detalles estructurados de una excepción sin alterar respuestas no objetuales. */
  private tryReadDetailsFromBody(body: string | object): Record<string, unknown> | undefined {
    if (typeof body !== 'object' || body === null) return undefined;
    const d = (body as { details?: unknown }).details;
    if (d && typeof d === 'object') return d as Record<string, unknown>;
    return undefined;
  }

  /** Traduce estados HTTP comunes al código estable correspondiente del catálogo. */
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

  /** Reconoce el arreglo de mensajes emitido por el ValidationPipe de NestJS. */
  private isValidationResponse(resp: string | object): boolean {
    if (typeof resp !== 'object' || resp === null) return false;
    const r = resp as { message?: unknown };
    return Array.isArray(r.message);
  }

  /** Normaliza los mensajes de validación a cadenas para convertirlos en detalles por campo. */
  private asMessageArray(resp: string | object): string[] {
    const r = resp as { message?: unknown };
    if (Array.isArray(r.message)) return r.message.map((m) => String(m));
    return [];
  }

  /** Devuelve un nombre seguro para registrar excepciones conocidas y desconocidas. */
  private errorName(exception: unknown): string {
    return exception instanceof Error ? exception.name : typeof exception;
  }

  /** Obtiene el mensaje de una excepción para el registro interno del servidor. */
  private errorMessage(exception: unknown): string {
    return exception instanceof Error ? exception.message : String(exception);
  }

  /** Obtiene la traza solo cuando el valor capturado es una instancia de Error. */
  private errorStack(exception: unknown): string | undefined {
    return exception instanceof Error ? exception.stack : undefined;
  }
}
