# Changelog

Todas las novedades relevantes de este repositorio se registran aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
versionado es [SemVer](https://semver.org/lang/es/).

La **versión vive en `package.json`**: el tag de la release y el `CHANGELOG.md`
deben coincidir con ella. El versionado es automático: `release-please` mantiene
un PR de release contra `develop` que sube la versión y escribe esta sección; al
mergearlo se crean el tag anotado y la GitHub Release. Ver
[`conventions/versioning.md`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/versioning.md).

## [0.4.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.3.2...v0.4.0) (2026-11-09)


### Features

* **admin:** add /admin/categories and /admin/users with admin guard ([#39](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/39)) ([e664f49](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/e664f497c0d4dae49cddb73e89f19409ee2c9967))
* **content:** add /content/generate endpoint ([#36](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/36)) ([364cfa4](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/364cfa40ae2c0969064740d4d3666a295a17b1b6)), closes [#10](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/10)
* **evaluation:** add /evaluation/submit endpoint ([#37](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/37)) ([a611653](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/a61165314a712d70d1b151672acbf5b29550b0a1)), closes [#13](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/13)
* **history:** add /history and /history/scores endpoints ([#38](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/38)) ([e588281](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/e58828122966f93198215e24da44f1de9c8c6d57)), closes [#16](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/16)
* **ia:** add AiDegradedService for retry + circuit breaker on provider calls ([#40](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/40)) ([da1e79c](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/da1e79ca687a18177e718d33f6b96fcb762eaca3)), closes [#18](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/18)


### Bug Fixes

* **ci:** la APP_VERSION de la imagen sale del manifiesto cuando no hay tag ([#91](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/91)) ([724dd0f](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/724dd0f288fc66aa0a6bcc03a63fdf9dfcbfa1f1)), closes [#43](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/43)
* **health:** validar disponibilidad de PostgreSQL ([#60](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/60)) ([99db216](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/99db2167e326836807f5ab7f82e7f0e8c86c62c7))

## [0.3.2](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.3.1...v0.3.2) (2026-11-09)


### Bug Fixes

* **ci:** autenticar en GHCR con el PAT ([#89](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/89)) ([f2d5cb5](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/f2d5cb53f58c976ee54381e47022f7ee1290d35b)), closes [#43](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/43)
* **ci:** construir la imagen multi-arquitectura (amd64 y arm64) ([#90](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/90)) ([5557713](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/5557713aac6195359e23db3cacd33e885fb12f76)), closes [#43](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/43)
* **ci:** escribir las etiquetas multi-linea con el delimitador de GITHUB_OUTPUT ([#87](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/87)) ([4947b28](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/4947b28427b3578cdcf1dcce8230e3bb9ddb6478)), closes [#43](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/43)

## [0.3.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.3.0...v0.3.1) (2026-11-09)


### Bug Fixes

* **ci:** construir la imagen con expresiones validas y etiquetas inmutables ([#86](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/86)) ([8b1ba4e](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/8b1ba4e5e674de3444e934bd5b16110e0e691caa)), closes [#43](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/43)
* **release:** activar el auto-merge aunque el PR de release ya exista ([#80](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/80)) ([a0da34f](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/a0da34f96ae2a24fe688ccf193d7e6efa13253eb)), closes [#4](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/4)

## [0.3.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.2.2...v0.3.0) (2026-11-08)


### Features

* **version:** exponer la version del build en GET /api/v1/version ([#82](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/82)) ([630b1a9](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/630b1a96e15ebfcc52ba9fc2d84651a9e96974d6)), closes [#27](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/27)

## [0.2.2](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.2.1...v0.2.2) (2026-11-06)


### Bug Fixes

* **ci:** enviar el nombre del repositorio en el aviso al manifiesto ([#77](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/77)) ([b3ac6e9](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/b3ac6e93eda2f54e3ac1c001e82390c3ed1772e2))

## [0.2.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.2.0...v0.2.1) (2026-11-06)


### Bug Fixes

* **ci:** separar el checkout del paso que anota el tag ([#75](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/75)) ([a1abe26](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/a1abe268b88018d8e632a9fffc4f919edef17952))

## [0.2.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.1.0...v0.2.0) (2026-11-06)


### Features

* **auth:** dtos de validación y endpoints de autenticación ([#33](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/33)) ([c96e279](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/c96e2796cbcf164ed679307032f356ed51c7bbc6)), closes [#4](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/4)
* **settings:** add /settings/categories and /settings/languages endpoints ([#35](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/35)) ([e77cfa2](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/e77cfa2b28331a408cd859cc7a3ff457f8cd0a43)), closes [#8](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/8)
* **user:** add GET and PATCH /user/profile endpoints ([#34](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/34)) ([5f9da88](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/5f9da88d34301a46bc58c960cb30122229744b4c)), closes [#5](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/5)


### Bug Fixes

* **ci:** compartir el agente SSH entre los pasos del workflow ([#64](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/64)) ([972fa6c](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/972fa6cd8ab774a8342de92766bea68985521375))
* **ci:** desplegar con la llave SSH cifrada mediante agente ([#63](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/63)) ([9e1a6d7](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/9e1a6d71360a82836d8e93096966483c4bfa39b2))
* **ci:** eximir a Dependabot de la validacion y evitar majors incompatibles ([#62](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/62)) ([a708304](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/a7083047045c732b12ed9995cea2363b016c6f3d))
* **ci:** reportar el estado del deployment a GitHub ([#67](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/67)) ([68f3ac5](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/68f3ac5b0386f89fe2e07cd2bab21e74981e14d8))

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
