import { HttpException, HttpStatus } from '@nestjs/common';
import { type ErrorCode, getErrorMeta } from './error-codes';

/**
 * Excepción de dominio que transporta un `ErrorCode` estable para que el filtro global
 * genere un sobre de error consistente.
 *
 * Usa esta clase en lugar de `new NotFoundException('...')` o equivalentes de NestJS
 * para garantizar que la API responda con un código documentado y nunca filtre
 * detalles internos del servidor al cliente.
 */
export class AppHttpException extends HttpException {
  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    const meta = getErrorMeta(code);
    // Envía el mensaje público, código y detalles dentro del cuerpo. El filtro los lee
    // para construir el sobre final, y el logger nativo de NestJS también los inspecciona.
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
 * Helper conciso para lanzar errores de dominio desde servicios y controladores.
 * Ejemplo: `throw httpError(ErrorCode.RESOURCE_NOT_FOUND, { id: 42 });`
 */
export const httpError = (code: ErrorCode, details?: Record<string, unknown>): AppHttpException =>
  new AppHttpException(code, details);

// Reexporta HttpStatus para controladores que aún lo requieran.
export { HttpStatus };
