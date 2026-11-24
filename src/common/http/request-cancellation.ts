import type { Response } from 'express';

/**
 * Plazo máximo del servidor para generar una lectura. Queda por debajo del timeout de IA
 * del frontend (`AI_TIMEOUT_MS = 110 s`) para que el cliente reciba un error explícito
 * en lugar de cortar la conexión sin saber si la lectura se creó.
 */
export const READING_GENERATION_DEADLINE_MS = 100_000;

export interface RequestCancellation {
  signal: AbortSignal;
  /** Libera el temporizador y el listener. Llamar siempre al terminar la petición. */
  dispose: () => void;
}

/**
 * Crea una señal que se aborta cuando el cliente cierra la conexión antes de recibir la
 * respuesta (`res` emite `close` sin haber terminado) o cuando vence `deadlineMs`.
 *
 * Se escucha `res` y no `req`: en Node, `req` emite `close` en cuanto termina de leer el
 * cuerpo, aunque el cliente siga esperando la respuesta.
 */
export function createRequestCancellation(res: Response, deadlineMs: number): RequestCancellation {
  const controller = new AbortController();
  const onClose = (): void => {
    if (!res.writableFinished) {
      controller.abort(new Error('client-disconnected'));
    }
  };
  const timer = setTimeout(() => controller.abort(new Error('deadline-exceeded')), deadlineMs);
  res.on('close', onClose);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      res.off('close', onClose);
    },
  };
}
