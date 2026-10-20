import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | undefined;

/**
 * Versión y commit de la aplicación en ejecución.
 *
 * La versión se lee del `package.json` (que el Dockerfile copia a la imagen),
 * de modo que el número que se ve en `/health` es siempre el mismo que
 * declara el repositorio y el del tag de la release. `GIT_COMMIT` lo inyecta
 * el Dockerfile en el build.
 */
export function appVersion(): { version: string; commit: string } {
  if (cached === undefined) {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
        version?: string;
      };
      cached = pkg.version ?? '0.0.0-dev';
    } catch {
      cached = '0.0.0-dev';
    }
  }
  return {
    version: process.env.APP_VERSION ?? cached,
    commit: process.env.GIT_COMMIT ?? 'unknown',
  };
}
