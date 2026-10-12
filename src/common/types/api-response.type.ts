/**
 * Standardised API response envelope.
 * Every endpoint returns either this shape (success) or a thrown exception (handled by AllExceptionsFilter).
 */
export interface ApiResponse<T = unknown> {
  message: string;
  data: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}
export const apiOk = <T>(message: string, data: T): ApiResponse<T> => ({
  message,
  data,
});

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
