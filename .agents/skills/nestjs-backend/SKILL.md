---
name: nestjs-backend
description: Cómo trabajar en el backend DolyNation (repo dolynation-atl-back). API REST con NestJS 11 + Drizzle ORM + PostgreSQL. Úsala al crear o modificar endpoints, servicios, DTOs, módulos, códigos de error, el schema de base de datos, tests, o al subir cambios (rama, commit, PR) de este repositorio.
---

# Backend DolyNation — `dolynation-atl-back`

Guía para trabajar en este repositorio. Todo lo específico está aquí; el flujo
global de la organización vive en el repo de docs (`dolynation-ehecatl-docs`).

## Stack y versiones

| Pieza | Versión |
| ----- | ------- |
| NestJS | 11 (`@nestjs/common` `core` `config` `jwt` `passport` `swagger` `terminus`) |
| Node | >= 22 (npm >= 11) |
| HTTP | Express 5 |
| ORM | Drizzle ORM 0.36 + driver `pg` (PostgreSQL) |
| Validación | `class-validator` + `class-transformer` (DTOs); **Zod solo** en `env.validation.ts` |
| Auth | JWT (`@nestjs/jwt` + `passport-jwt`), hash con `argon2` |
| Logs | `nestjs-pino` |
| Docs | Swagger + Scalar UI |
| Tests | Jest + ts-jest + supertest |

## Estructura

```
src/
├── main.ts                 # Bootstrap: helmet, compression, ValidationPipe, Scalar
├── app.module.ts           # Composition root
├── config/                 # env.config.ts, env.validation.ts (Zod)
├── common/                 # Transversal
│   ├── decorators/         # @Public(), @CurrentUser()
│   ├── errors/             # AllExceptionsFilter, ErrorCode, AppHttpException, ApiErrorDto
│   ├── guards/             # JwtAuthGuard
│   ├── interceptors/       # LoggingInterceptor
│   └── types/              # ApiResponse, apiOk/apiFail, decoradores de envelope
├── database/               # @Global con Drizzle (cliente + tokens)
│   └── drizzle/            # schema.ts, relations.ts, types.ts
└── modules/
    ├── auth/               # register, login, refresh, /me, logout
    ├── users/              # /users/streak
    ├── readings/           # /readings + subdominios prompt-generation, prompt-logs
    ├── ia/                 # /ia/chat + providers (MiniMax-M3, groq)
    └── health/             # /health/live, /health/ready
```

`CommonModule` registra globalmente: `APP_FILTER` (envelope de errores),
`APP_INTERCEPTOR` (log) y `APP_GUARD` (`JwtAuthGuard`, opt-in vía `@Public()`).

## Comandos

```bash
npm run start:dev     # dev con watch
npm run build         # nest build
npm run lint          # eslint --fix
npm run lint:check    # eslint (sin fix)
npm run format        # prettier --write
npm run format:check  # prettier --check
npm run typecheck     # tsc --noEmit
npm run test          # jest (unit + e2e)
npm run test:e2e      # jest --config ./test/jest-e2e.json
npm run verify        # typecheck + lint:check + format:check + test   ← antes de commitear
npm run verify:fix    # format + lint + typecheck + test
```

> Los e2e necesitan PostgreSQL levantado (repo `dolynation-tlalli-infra`:
> `docker compose -f docker-compose.test.yml up -d`).

## Reglas no negociables

1. **Envelope en toda respuesta.** Nunca devuelvas un objeto crudo:

   ```ts
   return apiOk('Message in English', result);      // 2xx
   return apiCreated('Created', result);            // 201
   throw new AppHttpException(ErrorCode.X, 'safe'); // 4xx/5xx
   ```

   Lo enforza el e2e `openapi-envelope`. Detalle: `references/envelope-error-codes.md`.

2. **Errores con `AppHttpException(ErrorCode.X, ...)`**, nunca
   `throw new NotFoundException(...)` de Nest directo.

3. **Nunca filtrar detalles internos** (SQL, paths, secrets, stack) en el
   `message`: el filtro los mapea a `INTERNAL_ERROR`.

4. **Contrato de API en inglés** (descripciones de DTOs, mensajes de error,
   operaciones). Código interno y docs en español.

## DTOs y documentación

- DTOs en `src/modules/<feature>/dto/`, con `@ApiProperty({ description, example })`,
  `class-validator` para validar y `!` en campos type-only.
- En controllers: `@ApiTags`, `@ApiBearerAuth('access-token')`, `@ApiOperation`,
  los helpers de envelope (`ApiOkResponseOf`, `ApiCreatedResponseOf`,
  `ApiOkResponseOfArray`, `ApiOkResponseEmpty`) y el decorador de error
  (`@ApiBadRequestResponse({ type: ApiErrorDto })`, etc.).

## Base de datos

PostgreSQL 15 vía Drizzle. **Drizzle es solo para tipos**; el SQL (schema,
migraciones) se escribe a mano y vive en `dolynation-tlalli-infra`
(`database/postgres/`). Detalle: `references/database-drizzle.md`.

## Tests

Unit `*.spec.ts` co-localizados + e2e en `test/`. Política por tipo de cambio y
qué testear: `references/testing.md`. Hoy son **71 tests unitarios** + los e2e.

## Flujo de trabajo en este repo

Rama, commits, PR, checks (incluye `openapi-guard`) y plantilla →
`references/workflow.md`. Resumen:

- Rama nueva desde `develop` (default). **Nunca** push directo a `develop`/`main`.
- `npm run verify` antes de commitear (husky corre `lint-staged` y `commitlint`).
- Commits Conventional, subject en **español**, ≤72, un concern por commit.
- PR hacia `develop`, título conventional, **squash**, 1 aprobación.
- `Closes #N` en el cuerpo del PR (en su propia línea).

## Referencias

- `references/architecture.md` — módulos y ciclos de request/error.
- `references/envelope-error-codes.md` — envelope, catálogo `ErrorCode`, helpers.
- `references/adding-endpoint.md` — los 6 pasos para añadir un endpoint.
- `references/adding-error-code.md` — cómo extender el catálogo de errores.
- `references/database-drizzle.md` — Postgres/Drizzle, schema y actualizaciones.
- `references/testing.md` — qué testear y política por tipo de cambio.
- `references/code-style-env.md` — TS estricto, ESLint/Prettier, imports, env.
- `references/workflow.md` — ramas, commits, PR, checks y plantilla.
