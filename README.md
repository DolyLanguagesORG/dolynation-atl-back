# Dolynglish Backend — `dolynation-atl-back`

API REST para la aplicación Dolynglish, construida con **NestJS 11** sobre
**PostgreSQL 15** con **Drizzle ORM**. Autenticación por JWT con refresh
tokens persistidos, hashing de passwords con Argon2id, y documentación
OpenAPI servida por Scalar.

> Este repositorio contiene **solo el backend**. El frontend vive en
> [`dolynation-tonatiuh-front`](https://github.com/DolyLanguagesORG/dolynation-tonatiuh-front),
> la infraestructura y el **schema SQL** en
> [`dolynation-tlalli-infra`](https://github.com/DolyLanguagesORG/dolynation-tlalli-infra)
> y la documentación de proyecto en
> [`dolynation-ehecatl-docs`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs).

## Stack

- **Runtime**: Node.js ≥ 22, npm ≥ 11
- **Framework**: NestJS 11 + Express
- **ORM**: Drizzle ORM + node-postgres
- **BD**: PostgreSQL 15
- **Auth**: Passport JWT + Argon2id
- **Validación**: class-validator + class-transformer
- **Documentación**: OpenAPI 3.1 + Scalar API Reference
- **Logging**: nestjs-pino (JSON en prod, pretty en dev)
- **Seguridad**: Helmet, Compression, CORS

## Arquitectura

```
Bootstrap → AppModule → CommonModule (filter, interceptor, guard global)
       → módulos: auth, users, readings, ia, health
       → Drizzle ORM (PostgreSQL) + AI providers (MiniMax-M3, groq)
```

Detalle completo en la
[documentación de arquitectura](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/architecture/overview.md).

## Quick start

Requisitos: Node ≥ 22, Docker.

```bash
# 1. Instalar
npm ci

# 2. Configurar entorno
cp .env.example .env
# Editar .env: JWT_SECRET, DB_PASSWORD, MINIMAX_API_KEY

# 3. Levantar Postgres. El compose y el schema viven en dolynation-tlalli-infra:
#    git clone https://github.com/DolyLanguagesORG/dolynation-tlalli-infra ../dolynation-tlalli-infra
#    cd ../dolynation-tlalli-infra && docker compose -f docker-compose.test.yml up -d && cd -

# 4. Arrancar el backend
npm run start:dev

# 5. Verificar
curl http://localhost:3333/api/v1/health/live
open http://localhost:3333/docs
```

## Project structure

```
src/
├── main.ts                  # Bootstrap (helmet, ValidationPipe, Scalar)
├── app.module.ts            # Composition root
├── config/                  # env.config.ts, env.validation.ts (Zod)
├── common/                  # Concerns transversales
│   ├── decorators/          # @Public(), @CurrentUser()
│   ├── errors/              # AllExceptionsFilter, ErrorCode, AppHttpException
│   ├── guards/              # JwtAuthGuard
│   ├── interceptors/        # LoggingInterceptor
│   └── types/               # ApiResponse, ApiSuccessEnvelopeDto, envelope decorators
├── database/                # @Global con Drizzle
│   └── drizzle/             # schema.ts, relations.ts, types.ts
└── modules/
    ├── auth/                # register, login, refresh, /me, logout
    ├── users/               # /users/streak
    ├── readings/            # /readings (generar, listar, evaluar)
    │   ├── prompt-generation/
    │   └── prompt-logs/
    ├── ia/                  # /ia/chat (passthrough al provider activo)
    │   └── providers/       # MiniMax-M3.provider, ai-provider.factory, interfaces
    └── health/              # /health/live, /health/ready (Terminus)
```

## Scripts

| Script                  | Qué hace                                                  |
| ----------------------- | --------------------------------------------------------- |
| `npm run start`         | Inicia el servidor en modo producción (requiere `npm run build`) |
| `npm run start:dev`     | Modo desarrollo con hot-reload (Nest watch)               |
| `npm run start:debug`   | Modo desarrollo con Node debugger                         |
| `npm run build`         | Compila TypeScript → `dist/`                              |
| `npm run lint`          | ESLint con `--fix`                                        |
| `npm run lint:check`    | ESLint sin `--fix` (para CI)                              |
| `npm run format`        | Prettier con `--write`                                    |
| `npm run format:check`  | Prettier con `--check` (para CI)                          |
| `npm run typecheck`     | `tsc --noEmit`                                            |
| `npm run test`          | Jest (unit + e2e, un solo config)                         |
| `npm run test:watch`    | Jest en modo watch                                        |
| `npm run test:cov`      | Jest con coverage                                         |
| `npm run test:e2e`      | Solo e2e (config dedicado)                                |
| `npm run verify`        | typecheck + lint:check + format:check + test (todo en uno) |
| `npm run verify:fix`    | format + lint (--fix) + typecheck + test                  |

## API docs

- **Scalar UI**: <http://localhost:3333/docs>
- **OpenAPI JSON**: <http://localhost:3333/api/v1/openapi.json>

Auth: Bearer JWT en header `Authorization: Bearer <token>`.

Las descripciones de DTOs, parámetros y operaciones están en **inglés**.
Ver [`docs/conventions/api-contracts.md`](./docs/conventions/api-contracts.md).

## Environment

Variables documentadas en
[`docs/conventions/environment.md`](./docs/conventions/environment.md).
Template editable en [`.env.example`](./.env.example).

## Testing

```bash
npm run verify    # typecheck + lint + format + test
```

Política completa en [`docs/conventions/testing.md`](./docs/conventions/testing.md).

## CI/CD

Workflows en `.github/workflows/`:

| Workflow | Checks | Qué valida |
| --- | --- | --- |
| `ci-backend.yml` | `unit-and-static`, `e2e`, `build` | tipos, lint, formato, tests unitarios, e2e y compilación |
| `openapi-guard.yml` | `openapi-guard` | que las respuestas 2xx usen el envelope correcto |
| `pr-title.yml` | `pr-title`, `pr-target` | el título del PR y las ramas base y origen |
| `pr-labels.yml` | `pr-labels` | copia al PR las etiquetas `sprint-*` y `area:*` del issue |

Seis checks son **obligatorios** para mergear contra `develop` y `main`:
`unit-and-static`, `e2e`, `build`, `openapi-guard`, `pr-title` y
`pr-target`. `pr-labels` es informativo: si falla avisa, pero no bloquea.

> Los jobs `e2e` y `openapi-guard` aplican el **schema SQL**, que es propiedad
> de `dolynation-tlalli-infra`; el workflow hace un checkout adicional de ese
> repositorio para obtenerlo.

`release.yml` no es un check de PR: corre al mergear en `main` y publica el tag.

## Conventions

Todas las reglas del proyecto viven en [`docs/conventions/`](./docs/conventions/README.md).
Las críticas:

- [Git workflow](./docs/conventions/git-workflow.md) — flujo de ramas
- [Commits](./docs/conventions/commits.md) — Conventional Commits
- [API contracts](./docs/conventions/api-contracts.md) — envelope + ErrorCode catalog
- [Code style](./docs/conventions/code-style.md) — TypeScript estricto
- [Security](./docs/conventions/security.md) — auth, headers, secrets

## Contributing

Lee la
[guía para hacer un PR](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/operations/COMO-HACER-UN-PR.md)
y las [convenciones](./docs/conventions/README.md).

## License

`UNLICENSED`. El repositorio es público, pero no se ha definido una licencia
abierta, así que todos los derechos quedan reservados.
