import type { NextFunction, Request, Response } from 'express';
import { appVersion } from '../version';

/**
 * Añade la cabecera `X-App-Version` a **toda** respuesta.
 *
 * Permite saber qué build respondió sin tener que pedir `/version` ni abrir
 * `/health`.
 *
 * Es un middleware y no un interceptor a propósito: un interceptor solo ve las
 * peticiones que llegan a un controlador, así que un 404 (ruta inexistente) o
 * un 401 (el guard global rechaza) se quedarían sin cabecera. El middleware se
 * ejecuta antes que el enrutado, de modo que cubre esas dos.
 */
export function versionHeaderMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-App-Version', appVersion().appVersion);
  next();
}
