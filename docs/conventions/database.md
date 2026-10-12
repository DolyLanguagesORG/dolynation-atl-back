# Database

El backend usa **PostgreSQL 15** vía **Drizzle ORM** sobre el driver `pg`.

## Stack

- **PostgreSQL 15** (en dev, prod vía Docker).
- **node-postgres** (`pg` ^8.13) como driver.
- **Drizzle ORM** (`drizzle-orm` ^0.36) como query builder y type-safety
  en el código backend.
- **Sin migraciones desde el backend**: el schema vive como SQL escrito
  a mano (ver siguiente sección).

## Nota sobre Drizzle

Drizzle se usa **solo** para tipos TypeScript y validación en el código
backend (`src/database/drizzle/schema.ts` da las formas de las
filas a `select()`/`insert()`).

Drizzle **no genera SQL** en este proyecto. Los archivos SQL en
`infrastructure/database/` se escriben y mantienen a mano. Drizzle no
corre migraciones contra la BD.

Si vienes de un proyecto Prisma/Drizzle-con-migrations: aquí el SQL es
manual y vive en `infrastructure/database/`. Drizzle es únicamente para
que el código del backend no se rompa cuando cambia el schema.

## Schema: dos archivos, dos fases

```
infrastructure/database/postgres/
├── 01-init.sql               # SIEMPRE el estado final deseado
└── updates/                  # vacío hasta el primer deploy a prod
    ├── README.md             # convención de updates
    └── YYYY-MM-DD_*.sql      # ALTERs idempotentes, orden alfabético
```

## Cambios al schema: regla de dos fases

La regla para tocar el schema depende de si `prod` ya fue desplegado
alguna vez o no.

### Fase 1 — Mientras `prod` NUNCA se ha desplegado (estamos en dev puro)

- Edita directamente `infrastructure/database/postgres/01-init.sql`
- NO crear archivos en `updates/` todavía — el contenedor de Postgres
  corre solo el init al arrancar
- El `01-init.sql` debe representar el **estado final deseado** del
  schema en producción (no el estado actual con parches intermedios
  comentados)

### Fase 2 — Una vez `prod` se desplegó al menos una vez

- **`01-init.sql` se congela** en el estado que tenía al momento del
  primer deploy. NO se edita más.
- Cada cambio va en
  `infrastructure/database/postgres/updates/YYYY-MM-DD_<nombre>.sql`
- Se aplican en orden alfabético (= orden cronológico de nombre)
- En prod, el init NO se vuelve a correr (el volumen de Postgres
  persiste, el entrypoint del contenedor ignora `initdb.d/` en
  arranques posteriores)

### En cualquier fase: usar statements idempotentes

Para que `01-init.sql` y todos los `updates/*.sql` puedan ejecutarse
juntos sin conflicto (caso típico: re-arrancar el contenedor de dev
después de un cambio, o resetear el schema en CI), todos los
statements deben ser **idempotentes**:

```sql
-- ✅ siempre idempotente
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_X ON ...(...);
CREATE UNIQUE INDEX IF NOT EXISTS ...;
ALTER TABLE readings ADD COLUMN IF NOT EXISTS user_response TEXT;
ALTER TABLE readings ALTER COLUMN user_response SET NOT NULL;
ALTER TABLE readings ADD CONSTRAINT ... CHECK (...);

-- ❌ no idempotente — no usar
CREATE TABLE users (...);
ALTER TABLE readings ADD COLUMN user_response TEXT;
DROP INDEX idx_X;
```

Idempotencia es lo que permite que el dev local pueda
re-ejecutar todo el set sin miedo a romper, y que CI pueda resetear
el schema de tests con `docker compose -f docker-compose.test.yml down -v`
sin distinguir "primer arranque" de "siguiente arranque".

> **Nota sobre `DROP COLUMN IF EXISTS`**: solo disponible en Postgres
> 16+. Este proyecto usa Postgres 15 así que esa sintaxis no
> funciona — para dropear una columna en un update usar un script
> nuevo en `updates/` con la versión sin `IF EXISTS` y aplicar solo
> una vez manualmente, o mover la columna a una convención de soft
> delete antes del primer deploy.

### Workflow concreto cuando agregas una columna

1. **Crear el archivo de update** —
   `infrastructure/database/postgres/updates/YYYY-MM-DD_<nombre>.sql`:
   ```sql
   -- YYYY-MM-DD: <descripción corta>
   ALTER TABLE readings ADD COLUMN IF NOT EXISTS user_response TEXT;
   ```
2. **Actualizar `01-init.sql`** para que el `CREATE TABLE readings`
   ya incluya la columna desde el inicio (mismo estado final):
   ```sql
   CREATE TABLE readings (
     ...
     user_response TEXT,
     ...
   );
   ```
3. **Commit ambos en el mismo PR** con mensaje
   `feat(db): add user_response column to readings`
4. Si hay código backend que referencia la columna, los cambios de
   código van en commits separados (respetando la regla de
   "commits pequeños" del [commits.md](./commits.md))

Ver el ejemplo canónico en
[`updates/README.md`](https://github.com/DolyLanguagesORG/dolynation-tlalli-infra/database/postgres/updates/README.md)
para el detalle de la convención.

## Tablas actuales

| Tabla                 | Propósito                                                  |
| --------------------- | ---------------------------------------------------------- |
| `users`               | Cuentas de usuario (email, password_hash, streak, etc.)    |
| `auth_access_tokens`  | Refresh tokens persistidos con hash                        |
| `readings`            | Lecturas generadas + respuestas del usuario + feedback IA  |
| `prompt_logs`         | Auditoría de prompts enviados al LLM                       |

## Convenciones de nombres

| Capa                  | Convención        | Ejemplo                         |
| --------------------- | ----------------- | ------------------------------- |
| Tablas SQL            | `snake_case`      | `auth_access_tokens`            |
| Columnas SQL          | `snake_case`      | `password_hash`, `created_at`   |
| Variables TS          | `camelCase`       | `passwordHash`, `createdAt`     |
| Archivos TS           | `kebab-case`      | `auth-access.tokens.ts`         |

El mapping snake_case ↔ camelCase se declara explícitamente en
[`src/database/drizzle/schema.ts`](../../src/database/drizzle/schema.ts).

## Conexión

- Provider global vía
  [`src/database/database.module.ts`](../../src/database/database.module.ts).
- Token `DRIZZLE` exportado en
  [`src/database/database.tokens.ts`](../../src/database/database.tokens.ts).
- En tests, mockear el provider con un objeto que expone `.select()`,
  `.insert()`, etc.
