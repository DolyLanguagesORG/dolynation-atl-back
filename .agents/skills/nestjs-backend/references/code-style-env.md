# Estilo de código y entorno

## TypeScript

- `strict` activado. **Evita `any`**: usa `unknown` + narrowing o genéricos.
- En DTOs, usa `!` en campos solo-tipo (`name!: string`).
- Import alias `@/*` → `src/*` (configurado en `tsconfig.json`). Úsalo para
  imports entre capas, p. ej. `import { ErrorCode } from '@/common/errors/error-codes';`.

## Linter y formato

- **ESLint** (flat config) y **Prettier**. Los scripts fuerzan el flat config:

  ```bash
  npm run lint          # eslint --fix "{src,test}/**/*.ts"
  npm run lint:check    # sin fix
  npm run format        # prettier --write
  npm run format:check  # prettier --check
  ```

- Se lintan/formatéan **solo** `src/` y `test/` (no la raíz). Por eso
  `jest.config.ts` queda fuera y no rompe el parser.

## Git hooks (Husky)

- **pre-commit** → `lint-staged`. Config `.lintstagedrc.json`:

  ```json
  {
    "{src,test}/**/*.{ts,tsx}": [
      "bash -c 'ESLINT_USE_FLAT_CONFIG=false eslint --fix \"$@\"' --",
      "prettier --write"
    ]
  }
  ```

  Nota: el comando usa `bash -c '... "$@"' --` porque `lint-staged` ejecuta sin
  shell. No lo simplifiques a `eslint --fix` a secas.

- **commit-msg** → `commitlint` (Conventional Commits).
- **pre-push** (si está configurado) → puede correr parte de `verify`.

## Convenciones de nombres

- Archivos y carpetas: **kebab-case** (`error-codes.ts`, `prompt-generation/`).
- Clases y tipos: **PascalCase** (`ReadingsService`, `CreateThingDto`).
- DTOs terminan en `Dto`; respuestas en `...ResponseDto`.
- Variables y métodos: **camelCase**; constantes/enums: **UPPER_SNAKE_CASE**.

## Variables de entorno

- Se validan con **Zod** en `src/config/env.validation.ts`; la app **no arranca**
  si falta/está mal una variable. El acceso tipado está en `env.config.ts`.
- Variables disponibles:

  | Grupo | Variables |
  | ----- | --------- |
  | App | `NODE_ENV` `PORT` `HOST` `API_PREFIX` `APP_NAME` `LOG_LEVEL` |
  | DB | `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_DATABASE` `DB_LOGGING` |
  | JWT | `JWT_SECRET` `JWT_ACCESS_TTL` `JWT_REFRESH_TTL` `JWT_ISSUER` |
  | IA | `AI_DEFAULT_PROVIDER` `MINIMAX_API_KEY` `MINIMAX_MODEL` `MINIMAX_ENDPOINT` `MINIMAX_TIMEOUT_MS` `MINIMAX_MAX_TOKENS` `MINIMAX_TEMPERATURE` `GROQ_API_KEY` `GROQ_MODEL` |

- **Nunca** commitees `.env` ni secrets. Si añades una variable nueva,
  documéntala en `.env.example` y en `env.validation.ts`.
