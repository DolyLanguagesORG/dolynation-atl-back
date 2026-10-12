# Environment variables

Política de configuración por variables de entorno. La fuente de verdad es
[`.env.example`](../../.env.example).

## Tabla de variables

| Variable                | Requerida | Tipo   | Default               | Descripción                                       |
| ----------------------- | --------- | ------ | --------------------- | ------------------------------------------------- |
| `NODE_ENV`              | No        | enum   | `development`         | `development` \| `production` \| `test`           |
| `PORT`                  | No        | int    | `3333`                | Puerto del servidor HTTP                          |
| `HOST`                  | No        | string | `0.0.0.0`             | Interface de bind                                 |
| `API_PREFIX`            | No        | string | `api/v1`              | Prefijo global de rutas                           |
| `APP_NAME`              | No        | string | `dolynglish-backend`  | Nombre lógico para logs                           |
| `DB_HOST`               | Sí        | string | -                     | Host de PostgreSQL                                |
| `DB_PORT`               | Sí        | int    | `5432`                | Puerto de PostgreSQL                              |
| `DB_USER`               | Sí        | string | -                     | Usuario de la BD                                  |
| `DB_PASSWORD`           | Sí        | string | -                     | Password de la BD                                 |
| `DB_NAME`               | Sí        | string | -                     | Nombre de la base                                 |
| `JWT_SECRET`            | Sí        | string | -                     | Secreto para firmar JWT (≥48 chars random)        |
| `JWT_ACCESS_TTL`        | No        | string | `15m`                 | TTL del access token                              |
| `JWT_REFRESH_TTL`       | No        | string | `30d`                 | TTL del refresh token                             |
| `JWT_ISSUER`            | No        | string | `dolynglish`          | Claim `iss`                                       |
| `AI_DEFAULT_PROVIDER`   | Sí        | enum   | -                     | `minimax` \| `groq`                               |
| `MINIMAX_API_KEY`       | Cond.*    | string | -                     | API key de MiniMax-M3 (*si provider es minimax)     |
| `MINIMAX_MODEL`         | No        | string | -                     | Modelo a usar                                     |
| `MINIMAX_BASE_URL`      | No        | string | -                     | URL del API                                       |
| `MINIMAX_MAX_TOKENS`    | No        | int    | `1024`                | Límite de tokens de salida                        |
| `MINIMAX_TEMPERATURE`   | No        | float  | `0.7`                 | Temperatura de sampling                           |
| `MINIMAX_TIMEOUT_MS`    | No        | int    | `30000`               | Timeout HTTP en ms                                |
| `GROQ_API_KEY`          | Cond.*    | string | -                     | API key de Groq (*si provider es groq)            |
| `GROQ_MODEL`            | No        | string | -                     | Modelo a usar                                     |
| `LOG_LEVEL`             | No        | enum   | `info`                | `trace` \| `debug` \| `info` \| `warn` \| `error` |

## Política de secretos

1. **Nunca** commitear `.env` ni `.env.production`. El `.gitignore` raíz
   bloquea `*/.env` y `*/.env.production`.
2. **Generar** `JWT_SECRET` con: `openssl rand -base64 48`
3. **Rotar** secretos cada 90 días en producción (proceso manual).
4. **Diferenciar** dev / staging / prod con archivos separados:
   `.env.development`, `.env.production`, etc.

## Validación

Las variables se validan al arrancar con un schema Zod en
[`src/config/env.validation.ts`](../../src/config/env.validation.ts).
Si falta una variable requerida o tiene un valor inválido, la app **no
arranca** y muestra el error exacto.

## Cómo arrancar en local

```bash
cp .env.example .env
# Editar .env y rellenar DB_PASSWORD, JWT_SECRET, MINIMAX_API_KEY, etc.
```

Para la BD de desarrollo, se usa
[`infrastructure/docker-compose.test.yml`](https://github.com/DolyLanguagesORG/dolynation-tlalli-infra/docker-compose.test.yml):

```bash
cd ../dolynation-tlalli-infra
docker compose -f docker-compose.test.yml up -d
```

El schema se aplica automáticamente al primer arranque del contenedor.