import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';
import { extractClientIp, extractCountryCode, extractUserAgent } from './utils/ip-extractor.util';

/** Nombre normalizado de la cabecera de correlación aceptada en solicitudes entrantes. */
const REQUEST_ID_HEADER = 'x-request-id';
/** Formato permitido para reutilizar un identificador de petición enviado por el cliente. */
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9._-]{1,64}$/;
/** Límite defensivo para la ruta almacenada en el contexto de la petición. */
const MAX_HTTP_PATH_LENGTH = 500;

/** Reutiliza un `X-Request-Id` válido o genera uno nuevo para correlacionar la petición. */
function resolveRequestId(req: Request): string {
  const raw = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (VALID_REQUEST_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return randomUUID();
}

/**
 * Crea un middleware Express idempotente que inicializa `RequestContextService`
 * para cada petición HTTP (incluidos 404 y 401) y propaga `X-Request-Id`.
 */
export function createRequestContextMiddleware(
  requestContext: RequestContextService,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Idempotencia: si ya fue inicializado en main.ts antes de los guards/rutas, no sobreescribe.
    if (requestContext.get()) {
      next();
      return;
    }

    const requestId = resolveRequestId(req);
    res.setHeader('X-Request-Id', requestId);

    const rawPath = req.originalUrl || req.url || '/';
    const httpPath = rawPath.slice(0, MAX_HTTP_PATH_LENGTH);

    requestContext.run(
      {
        requestId,
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
        country: extractCountryCode(req),
        httpMethod: req.method ? req.method.toUpperCase().slice(0, 10) : null,
        httpPath,
        startedAt: Date.now(),
      },
      () => {
        next();
      },
    );
  };
}

/**
 * Middleware inyectable para módulos/tests que arrancan `AppModule` sin pasar por `main.ts`.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly handler: (req: Request, res: Response, next: NextFunction) => void;

  constructor(requestContext: RequestContextService) {
    this.handler = createRequestContextMiddleware(requestContext);
  }

  /** Delega al inicializador compartido del contexto de petición. */
  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}
