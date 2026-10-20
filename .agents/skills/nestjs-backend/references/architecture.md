# Arquitectura — `dolynation-atl-back`

API REST en NestJS 11 siguiendo el patrón **controller → service → repository**,
con capas transversales en `common/`.

## Mapa de módulos

```
src/
├── main.ts                 # Bootstrap
├── app.module.ts           # Composition root
├── config/                 # env.config.ts + env.validation.ts (Zod)
├── common/                 # Transversal (se registra global en CommonModule)
│   ├── decorators/         # @Public(), @CurrentUser()
│   ├── errors/             # AllExceptionsFilter, ErrorCode, AppHttpException, ApiErrorDto
│   ├── guards/             # JwtAuthGuard
│   ├── interceptors/       # LoggingInterceptor
│   └── types/              # ApiResponse, apiOk/apiCreated/apiFail, decoradores de envelope
├── database/               # @Global: Drizzle (schema.ts, relations.ts, types.ts)
└── modules/
    ├── auth/               # registro, login, refresh, /me, logout
    ├── users/              # /users/streak
    ├── readings/           # /readings + prompt-generation, prompt-logs
    ├── ia/                 # /ia/chat + providers (MiniMax-M3, groq)
    └── health/             # /health/live, /health/ready (Terminus)
```

Cada módulo de feature: `*.module.ts`, `*.controller.ts`, `*.service.ts`,
`dto/`, `entities/` o `types/`, y tests `*.spec.ts`.

## `main.ts` (bootstrap)

1. `helmet()` y `compression()`.
2. `ConfigModule` con `env.validation.ts` (Zod) — la app **no arranca** si falta
   o está mal una variable.
3. `ValidationPipe` global: `whitelist`, `forbidNonWhitelisted`, `transform`.
4. Prefijo global de rutas: **`/api/v1`**.
5. Logger `nestjs-pino`.
6. Documentación: Swagger + **Scalar UI**.

## `CommonModule` (transversal global)

Registra como providers globales:

- `APP_FILTER` → **`AllExceptionsFilter`**: convierte toda excepción al envelope
  de error (ver `references/envelope-error-codes.md`).
- `APP_INTERCEPTOR` → **`LoggingInterceptor`**: loguea cada request/response.
- `APP_GUARD` → **`JwtAuthGuard`**: **todo requiere JWT** salvo lo marcado con
  `@Public()`.

## Ciclo de una petición

```
request
  → pino (log de entrada)
  → JwtAuthGuard  (si no es @Public; valida el Bearer y adjunta el usuario)
  → ValidationPipe (valida y transforma el DTO de entrada)
  → Controller    (orquesta; documenta y envuelve la respuesta)
  → Service       (lógica de negocio)
  → Repository/DB (Drizzle → PostgreSQL)
  → apiOk/apiCreated → respuesta { message, data }
```

## Ciclo de un error

```
throw new AppHttpException(ErrorCode.X, 'mensaje seguro en inglés')
  → AllExceptionsFilter
  → HTTP <status> con { message, data: null, error: { code, message, details? } }
```

Cualquier excepción que **no** sea `AppHttpException` (incluidas las de Nest
como `NotFoundException`) o un error inesperado se mapea a
`ErrorCode.INTERNAL_ERROR` **sin filtrar** el detalle interno (SQL, stack, paths).

## Base de datos

`DatabaseModule` es `@Global` y expone el cliente Drizzle (driver `pg`) y los
tipos de `schema.ts` / `relations.ts`. Ver `references/database-drizzle.md`.

## Health

`health` expone `/health/live` y `/health/ready` con `@nestjs/terminus`
(listo para contenedores/orquestador). No requiere `@Public()` si se acuerda lo
contrario — revisa el controller antes de asumir.
