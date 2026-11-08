import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Identificación del build en ejecución.
 *
 * - `appVersion` — la versión **única de la aplicación**, la que compone
 *   `versions.yml` (el manifiesto de qué versión de cada repositorio forma
 *   la app publicada). La inyecta el despliegue.
 * - `component` — qué pieza de la aplicación es este proceso.
 * - `version` — la versión **de este repositorio**.
 * - `commit` — el SHA exacto del código desplegado.
 * - `builtAt` — cuándo se construyó el artefacto.
 *
 * Todos llegan por variables de entorno, con un fallback razonable para que
 * la app nunca deje de arrancar por falta de una de ellas.
 */
export interface AppVersion {
  appVersion: string;
  component: string;
  version: string;
  commit: string;
  builtAt: string;
}

/** Componente por defecto: este repo. */
const DEFAULT_COMPONENT = 'dolynation-atl-back';

let cachedVersion: string | undefined;
let cachedBuiltAt: string | undefined;

/**
 * La versión del repositorio, leída del `package.json`.
 *
 * El `package.json` está en la imagen (el Dockerfile lo copia), así que el
 * número que se ve en `/version` es siempre el mismo que declara el
 * repositorio y el del tag de la release.
 */
function repoVersion(): string {
  if (cachedVersion === undefined) {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
        version?: string;
      };
      cachedVersion = pkg.version ?? '0.0.0-dev';
    } catch {
      cachedVersion = '0.0.0-dev';
    }
  }
  return cachedVersion;
}

/**
 * Cuándo se construyó el artefacto.
 *
 * `BUILT_AT` lo inyecta el build de la imagen. Si no está (por ejemplo en
 * desarrollo, donde el código se monta y no se empaqueta), se usa la hora de
 * **arranque del proceso**, cacheada para que no cambie entre llamadas: si
 * cambiara, dos peticiones al mismo build darían fechas distintas y no se
 * podría auditar.
 */
function builtAt(): string {
  cachedBuiltAt ??= process.env.BUILT_AT ?? new Date().toISOString();
  return cachedBuiltAt;
}

/**
 * Limpia la caché en memoria.
 *
 * Solo lo usan los tests: en producción el proceso se reinicia con cada
 * despliegue, así que la caché nunca vive lo suficiente como para quedar
 * obsoleta.
 */
export function resetVersionCache(): void {
  cachedVersion = undefined;
  cachedBuiltAt = undefined;
}

/**
 * Versión y commit del build en ejecución.
 *
 * La usan `/health/live`, `/health/ready`, la raíz de la API y
 * `GET /api/v1/version`: los cuatro reportan exactamente lo mismo.
 */
export function appVersion(): AppVersion {
  return {
    // La versión de la app es la del manifiesto; si no está inyectada, se usa
    // la de este repo, que es lo mejor que se puede saber sin el manifiesto.
    appVersion: process.env.APP_VERSION ?? repoVersion(),
    component: process.env.COMPONENT ?? DEFAULT_COMPONENT,
    // La versión de ESTE repo sale siempre del `package.json` que trae el
    // artefacto: es la verdad del código que corre, no la que alguien
    // inyectó por error.
    version: repoVersion(),
    commit: process.env.GIT_COMMIT ?? 'unknown',
    builtAt: builtAt(),
  };
}
