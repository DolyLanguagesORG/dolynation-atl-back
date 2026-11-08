import type { NextFunction, Response } from 'express';
import { versionHeaderMiddleware } from './version-header.middleware';

describe('versionHeaderMiddleware', () => {
  const makeRes = (headers: Record<string, string>) =>
    ({
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    }) as unknown as Response;

  it('añade la cabecera X-App-Version a la respuesta', () => {
    const headers: Record<string, string> = {};
    const next: NextFunction = jest.fn();

    versionHeaderMiddleware({} as never, makeRes(headers), next);

    expect(headers['X-App-Version']).toMatch(/^\d+\.\d+\.\d+/);
    expect(next).toHaveBeenCalled();
  });

  it('la cabecera lleva la version de la aplicacion', () => {
    // X-App-Version es la version UNICA de la app (la del manifiesto), no
    // la del repositorio: es lo que responde la app completa.
    const headers: Record<string, string> = {};
    const next: NextFunction = jest.fn();

    process.env.APP_VERSION = '1.2.3';
    versionHeaderMiddleware({} as never, makeRes(headers), next);
    delete process.env.APP_VERSION;

    expect(headers['X-App-Version']).toBe('1.2.3');
  });
});
