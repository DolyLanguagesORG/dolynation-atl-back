# Changelog

Todas las novedades relevantes de este repositorio se registran aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
versionado es [SemVer](https://semver.org/lang/es/).

La **versión vive en `package.json`**: el tag de la release y el `CHANGELOG.md`
deben coincidir con ella. El versionado es automático: `release-please` mantiene
un PR de release contra `develop` que sube la versión y escribe esta sección; al
mergearlo se crean el tag anotado y la GitHub Release. Ver
[`conventions/versioning.md`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/versioning.md).

## [0.18.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.17.0...v0.18.0) (2026-11-28)


### Features

* **readings:** endurecer ia, auditoria de pagos, resiliencia y suites e2e y carga ([#207](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/207)) ([c0b4dc0](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/c0b4dc07b425c475369de8cb2fd7e001b415bac3))
* **settings:** validar categorias en vivo y limitar resumen de lectura a 500 palabras ([#205](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/205)) ([0dce383](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/0dce383a75cf425cbe487d421e92a129670bf960))


### Bug Fixes

* **e2e:** evitar borrar categorias compartidas en teardown paralelo ([#209](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/209)) ([54d39d2](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/54d39d23febbc0fa148194bccc1020163f989574))
* **security:** actualizar dependencias criticas, chmod 600 y release draft ([#208](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/208)) ([cafc3e9](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/cafc3e9dc154cbbb95326f3b7273550f14cd0865))

## [0.17.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.16.1...v0.17.0) (2026-11-25)


### Features

* **readings:** versionar prompts por idioma y seed reproducible ([#201](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/201)) ([4b42481](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/4b4248159bdd2df0aedaeb2735eb38335e505c3f))

## [0.16.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.16.0...v0.16.1) (2026-11-24)


### Bug Fixes

* **auth:** evitar condicion de carrera en e2e de aviso OAuth ([#199](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/199)) ([ca70692](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/ca706920b3d921459a734ca07b96458201c5f12b))

## [0.16.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.15.2...v0.16.0) (2026-11-24)


### Features

* **friendships:** implementar modulo de amistades y rachas ([#195](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/195)) ([221827d](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/221827d13d20dfabed8c755e64ed5913dee191c5))

## [0.15.2](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.15.1...v0.15.2) (2026-11-24)


### Bug Fixes

* **auth:** avisar por correo al vincular OAuth y al intentar contraseña en cuentas solo-OAuth ([#191](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/191)) ([674e19b](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/674e19b26c8d2bcba00791a5150dffa3c1b1b74c)), closes [#188](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/188)
* **auth:** bloquea contrasena en cuentas OAuth-only ([#194](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/194)) ([4cf637e](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/4cf637e070fd2b0ec2ae62f835f74b8b19d281c4)), closes [#193](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/193)

## [0.15.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.15.0...v0.15.1) (2026-11-24)


### Bug Fixes

* **readings:** cancela la generación si el cliente se va o vence el plazo ([#192](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/192)) ([90820cc](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/90820cc9968b3cd33799c1d9458400d8e81a2753)), closes [#190](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/190)

## [0.15.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.14.1...v0.15.0) (2026-11-23)


### Features

* **auth:** integra inicio de sesion y registro con microsoft entra id ([#186](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/186)) ([ac7d524](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/ac7d524ae93183875ec0a4980f7acd2d57abad51))

## [0.14.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.14.0...v0.14.1) (2026-11-23)


### Bug Fixes

* **kanban:** el tablero se lee entero (pagina los items) ([#180](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/180)) ([fd62272](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/fd622721ff17408826c8b63413d4e783987fc426))

## [0.14.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.13.1...v0.14.0) (2026-11-23)


### Features

* **security:** implementa proteccion anti-bot con cloudflare turnstile y rate limit por ip ([#173](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/173)) ([e40f96f](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/e40f96f6e8db3677cdd339d1ebab9d6ee0312558))

## [0.13.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.13.0...v0.13.1) (2026-11-22)


### Bug Fixes

* **auth:** evita la toma de cuentas por OAuth y normaliza los correos ([#169](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/169)) ([18d380c](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/18d380c016c604c8c51deebaab22e50241c1d4f3)), closes [#168](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/168)

## [0.13.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.12.0...v0.13.0) (2026-11-22)


### Features

* **readings:** la evaluacion acepta una clave de idempotencia ([#170](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/170)) ([541f0ae](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/541f0aebbba3990085f52db632dbaa32d81b0b40)), closes [#131](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/131)

## [0.12.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.11.2...v0.12.0) (2026-11-21)


### Features

* **auth:** implementa autenticacion google oauth con pkce y bloqueo admin ([#166](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/166)) ([36d9b27](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/36d9b270556736381288ef345a4c82fdac61e7d8))

## [0.11.2](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.11.1...v0.11.2) (2026-11-21)


### Bug Fixes

* **readings:** evita pasarse de la cuota diaria de explicaciones en paralelo ([#154](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/154)) ([1bdfd70](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/1bdfd709e3b9b121bd856f44cd0eaf2e4ea88c76))

## [0.11.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.11.0...v0.11.1) (2026-11-21)


### Bug Fixes

* **billing:** corrige reembolsos parciales y de desbloqueo de idioma ([#158](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/158)) ([d35f91c](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/d35f91cccb5371a16b94faf78b1f248863f92368)), closes [#156](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/156)
* **readings:** corrige carreras en límites, evaluaciones y créditos de idioma ([#152](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/152)) ([ccf9fb3](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/ccf9fb3d97d04146851d53f2352f98ffaeaa24bd)), closes [#151](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/151)

## [0.11.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.10.0...v0.11.0) (2026-11-20)


### Features

* **billing:** implementa modulo de pagos y suscripciones con stripe ([#148](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/148)) ([76319f6](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/76319f6c875923f926015c6837ee3b07bd9208c0))

## [0.10.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.9.0...v0.10.0) (2026-11-19)


### Features

* **auth:** agrega roles admin, solicitudes de acceso y logs ([#145](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/145)) ([7f9bd20](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/7f9bd20d2c71d2e120a4ef5fb0d27a5c7e7ebbfe))

## [0.9.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.8.0...v0.9.0) (2026-11-16)


### Features

* **ia:** los errores del provider de IA se explican y no gastan cuota ([#138](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/138)) ([deca98b](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/deca98b181001ebb6fc40d46adbde6a7c9eb941d)), closes [#137](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/137)

## [0.8.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.7.0...v0.8.0) (2026-11-16)


### Features

* **settings:** el catalogo de categorias sale de las categorias dinamicas ([#129](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/129)) ([647a6d0](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/647a6d01224579513ecbb7eaf96dc5926ef0f33d)), closes [#128](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/128)


### Bug Fixes

* **settings:** el PUT de categorias tambien devuelve el catalogo ([#131](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/131)) ([41b9e6f](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/41b9e6f1b65c95241a20239d230774ff598e4bfd)), closes [#128](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/128)

## [0.7.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.6.1...v0.7.0) (2026-11-16)


### Features

* **i18n:** trae el trabajo de multilenguaje y glosario de la rama de Sebastian ([#126](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/126)) ([bf95489](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/bf954892b82355bceed73de93fc798e3f6ef5d49))

## [0.6.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.6.0...v0.6.1) (2026-11-15)


### Bug Fixes

* **kanban:** leer la accion del evento y no el nombre del step ([#118](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/118)) ([64440ad](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/64440ad38f4840901f8ecc204e43d56f41e1b69a)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)

## [0.6.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.5.1...v0.6.0) (2026-11-15)


### Features

* **subscriptions:** cuotas diarias, nivel del plan y limites por idioma y categoria ([#114](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/114)) ([b515a0d](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/b515a0dd1f2b35fd1c9b4ff68588d9e8eb293fe1))

## [0.5.1](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.5.0...v0.5.1) (2026-11-15)


### Bug Fixes

* **kanban:** detecta si un numero es issue o pull request ([#115](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/115)) ([7309ca3](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/7309ca32cef8122cfdce1197bd29af6b86dcd8c5)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)

## [0.5.0](https://github.com/DolyLanguagesORG/dolynation-atl-back/compare/v0.4.0...v0.5.0) (2026-11-12)


### Features

* **kanban:** las issues pasan a 'In Review' solas ([#106](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/106)) ([fbe5801](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/fbe5801387801efde406c2e037a7671cc6b584c2)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)
* **kanban:** las issues pasan a 'In Review' solas ([#107](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/107)) ([467b5c4](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/467b5c492188c91066e0edf67eef189a0374f201)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)
* **kanban:** las issues pasan a 'In Review' solas ([#108](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/108)) ([8141597](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/8141597d77694fef134f86a99be665e3ce19bf74)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)
* **kanban:** las issues pasan a 'In Review' solas ([#109](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/109)) ([bffc828](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/bffc828c67a2efa545aba438cbbbd632dd668329)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)
* **kanban:** las issues pasan a 'In Review' solas ([#110](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/110)) ([874fc3a](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/874fc3a51b14b7fe12bd1a572f5b9eddd10b02eb)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)
* **kanban:** las issues pasan a 'In Review' solas ([#111](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/111)) ([e8a83bb](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/e8a83bbebdef40d78e1c50c3afbf5a0bb396c8d2)), closes [#66](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/66)
* **readings:** validar cuotas, idioma y enriquecer prompts ([#105](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/105)) ([549ee01](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/549ee0165b56771e7f28a217d0fe76d45301e384))
* **smtp:** el .env de desarrollo lleva las variables de correo ([#103](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/103)) ([93cf8ef](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/93cf8ef29c4fd7bcc910997d5e221d9ac9f592fd)), closes [#102](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/102)


### Bug Fixes

* **ci:** quitar las claves duplicadas del deploy y validar los workflows con actionlint ([#112](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/112)) ([be74733](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/be74733dd3a5566794a55e9f568b2a9205eb2d4b)), closes [#103](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/103)
* **ci:** separar las unitarias de las e2e y dejar el proveedor de IA consistente ([#100](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/100)) ([b0a840d](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/b0a840d163399dbc8caa2d7e97dd84143266f58f))
* **ci:** validar la rama normalizada (los acentos no bloquean el PR) ([#98](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/98)) ([4aba3b0](https://github.com/DolyLanguagesORG/dolynation-atl-back/commit/4aba3b0b0940acbc3b6b1c19ba1ea8ce14b001f3)), closes [#46](https://github.com/DolyLanguagesORG/dolynation-atl-back/issues/46)

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
