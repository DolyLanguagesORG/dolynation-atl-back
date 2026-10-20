# Changelog

Todas las novedades relevantes de este repositorio se registran aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
versionado es [SemVer](https://semver.org/lang/es/).

La **versión vive en `package.json`**: el tag de la release y el `CHANGELOG.md`
deben coincidir con ella, y el workflow `release.yml` lo verifica antes de
publicar. Ver [`conventions/versioning.md`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/versioning.md).

## [No publicado]

### Añadido
- `GET /api/v1/health/live` y `GET /api/v1/health/ready` devuelven la **versión**
  y el **commit** del build en ejecución.
- Nueva variable `GIT_COMMIT` (la inyecta el Dockerfile) y `APP_VERSION` para
  sobrescribirla.
- Devcontainer para trabajar en Codespaces con Node 22, Docker y `gh`.

### Cambiado
- La versión de `package.json` pasa de `1.0.0` (que nunca se liberó) a `0.1.0`,
  que es la release real.

## [0.1.0] - 2026-10-12

### Añadido
- Estructura inicial del repositorio, reglas de protección de rama y plantilla
  de pull request.
- API base con NestJS, Drizzle y PostgreSQL, envelope de respuestas y códigos de
  error.

[No publicado]: https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DolyLanguagesORG/dolynation-atl-back/releases/tag/v0.1.0
