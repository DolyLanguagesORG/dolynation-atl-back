/**
 * Sobre estandarizado de respuesta de la API.
 * Cada endpoint devuelve esta estructura (en éxito) o lanza una excepción
 * transformada por `AllExceptionsFilter`.
 */
export interface ApiResponse<T = unknown> {
  message: string;
  data: T;
  error?: ApiError;
}

/** Estructura del objeto `error` dentro de una respuesta fallida. */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}

/** Construye una respuesta exitosa estándar envolviendo el payload en `data`. */
export const apiOk = <T>(message: string, data: T): ApiResponse<T> => ({
  message,
  data,
});

/** Construye una respuesta de error estándar con `data: null` y el objeto `error`. */
export const apiFail = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiResponse<null> => {
  const error: ApiError = details !== undefined ? { code, message, details } : { code, message };
  return {
    message,
    data: null,
    error,
  };
};
