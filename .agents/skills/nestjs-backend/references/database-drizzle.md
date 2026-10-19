# Base de datos (PostgreSQL + Drizzle)

PostgreSQL **15** con **Drizzle ORM** (`drizzle-orm` + driver `pg`).

## Principio clave

- **Drizzle es la capa de tipos y de query building.** Los tipos de tablas se
  derivan del schema para tipar las consultas y los repositorios.
- **El SQL (schema, relaciones, migraciones) se escribe a mano** y vive en el repo
  [`dolynation-tlalli-infra`](https://github.com/DolyLanguagesORG/dolynation-tlalli-infra),
  en `database/postgres/` (p. ej. `01-init.sql`).
- **No** generes migraciones con `drizzle-kit` salvo que el equipo lo acuerde.
  El schema de `schema.ts` debe **reflejar** el SQL real de infra, no inventarlo.

## Dónde está

```
src/database/
├── database.module.ts      # @Global: expone el cliente y los tipos
├── database.tokens.ts      # token de inyección del cliente Drizzle
└── drizzle/
    ├── schema.ts           # definición de tablas Drizzle (fuente de tipos)
    ├── relations.ts        # relaciones (para queries relacionales)
    └── types.ts            # tipos derivados ($inferSelect / $inferInsert)
```

`DatabaseModule` es `@Global`, así que puedes inyectar el cliente/servicio de
Drizzle sin reimportar el módulo.

## Configuración

Desde variables de entorno (validadas con Zod en `src/config/env.validation.ts`):

| Variable | Notas |
| -------- | ----- |
| `DB_HOST` | default `127.0.0.1` |
| `DB_PORT` | default `5432` |
| `DB_USER` | default `dolynglish_user` |
| `DB_PASSWORD` | sin default en prod |
| `DB_DATABASE` | default `dolynglish` |
| `DB_LOGGING` | activa el log de queries |

## Tipar desde el schema

```ts
import { readings } from '@/database/drizzle/schema';

type Reading = typeof readings.$inferSelect;      // fila leída
type NewReading = typeof readings.$inferInsert;   // fila a insertar
```

## Cambiar la base de datos (orden obligatorio)

1. Escribe el SQL a mano en `dolynation-tlalli-infra` → `database/postgres/`.
2. Actualiza `src/database/drizzle/schema.ts` (y `relations.ts`) para reflejarlo.
3. Ajusta `types.ts` si aplica.
4. Actualiza repositorios/servicios que usen esas tablas.
5. Tests + `npm run verify`.

Recuerda: el **mismo SQL de infra** se aplica en CI (jobs `e2e` y `openapi-guard`
hacen checkout de `dolynation-tlalli-infra` y ejecutan `01-init.sql`), así que un
schema desincronizado rompe la CI.
