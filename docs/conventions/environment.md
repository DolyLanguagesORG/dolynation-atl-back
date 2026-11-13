# Environment variables

Política de configuración por variables de entorno. La fuente de verdad es
[`.env.example`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/.env.example).

## Tabla de variables

| Variable                | Requerida | Tipo    | Default                                        | Descripción                                                |
| ----------------------- | --------- | ------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `NODE_ENV`            | No        | enum    | `development`                                | `development` \| `production` \| `test`               |
| `PORT`                | No        | int     | `3333`                                       | Puerto del servidor HTTP                                    |
| `HOST`                | No        | string  | `0.0.0.0`                                    | Interface de bind                                           |
| `API_PREFIX`          | No        | string  | `api/v1`                                     | Prefijo global de rutas                                     |
| `APP_NAME`            | No        | string  | `dolynglish-backend`                         | Nombre lógico para logs                                    |
| `DB_HOST`             | Sí       | string  | -                                              | Host de PostgreSQL                                          |
| `DB_PORT`             | Sí       | int     | `5432`                                       | Puerto de PostgreSQL                                        |
| `DB_USER`             | Sí       | string  | -                                              | Usuario de la BD                                            |
| `DB_PASSWORD`         | Sí       | string  | -                                              | Password de la BD                                           |
| `DB_DATABASE`         | Sí       | string  | -                                              | Nombre de la base                                           |
| `DB_LOGGING`          | No        | boolean | `false`                                      | Logging de queries de Drizzle                               |
| `JWT_SECRET`          | Sí       | string  | -                                              | Secreto para firmar JWT (≥48 chars random)                 |
| `JWT_ACCESS_TTL`      | No        | string  | `5m`                                         | TTL del access token                                        |
| `JWT_REFRESH_TTL`     | No        | string  | `30d`                                        | TTL del refresh token                                       |
| `AI_DEFAULT_PROVIDER` | Sí       | enum    | `minimax`                                    | `minimax` \| `groq`                                     |
| `MINIMAX_API_KEY`     | Cond.*    | string  | -                                              | API key de MiniMax-M3 (*si provider es minimax)             |
| `MINIMAX_MODEL`       | No        | string  | `MiniMax-M3`                                 | Modelo a usar                                               |
| `MINIMAX_ENDPOINT`    | No        | string  | `https://api.minimax.io/v1/chat/completions` | URL del API                                                 |
| `MINIMAX_MAX_TOKENS`  | No        | int     | `8192`                                       | Límite de tokens de salida                                 |
| `MINIMAX_TEMPERATURE` | No        | float   | `0.6`                                        | Temperatura de sampling                                     |
| `MINIMAX_TIMEOUT_MS`  | No        | int     | `90000`                                      | Timeout HTTP en ms                                          |
| `MINIMAX_REASONING_EFFORT` | No   | enum    | `low`                                        | Esfuerzo de razonamiento (`low` \| `medium` \| `high`)       |
| `GROQ_API_KEY`        | Cond.*    | string  | -                                              | API key de Groq (*legacy; si provider es groq)              |
| `GROQ_MODEL`          | No        | string  | `qwen/qwen3-32b`                             | Modelo legacy                                               |
| `LOG_LEVEL`           | No        | enum    | `info`                                       | `trace` \| `debug` \| `info` \| `warn` \| `error` |
| `CATEGORY_MODERATION_ENABLED` | No | boolean | `true`                                    | Activa/desactiva moderación de categorías dinámicas         |
| `CATEGORY_MODERATION_AI_ENABLED` | No | boolean | `true`                                 | Activa validación semántica batch con IA del sistema        |
| `CATEGORY_MODERATION_AI_PROVIDER` | No | enum | `auto`                                  | `auto` \| `openai` (solo moderación gratuita) \| `minimax` \| `none` |
| `CATEGORY_DAILY_LIMIT` | No | int | `20`                                                | Tope diario de categorías nuevas distintas evaluadas/usuario |
| `CATEGORY_MODERATION_SCORE_THRESHOLD` | No | float | `0.45`                              | Umbral (0.05-1) para APIs gratuitas de moderación           |
| `CATEGORY_MODERATION_TIMEOUT_MS` | No | int | `5000`                                     | Timeout HTTP/IA para moderación de categorías en ms         |
| `CATEGORY_MODERATION_CACHE_TTL_MS` | No | int | `86400000`                               | TTL del caché en memoria para categorías moderadas          |
| `OPENAI_API_KEY`      | No        | string  | -                                            | Clave opcional para OpenAI Moderation API (gratuita)        |
| `OPENAI_MODERATION_ENDPOINT` | No | url | `https://api.openai.com/v1/moderations`      | URL de OpenAI Moderation API                                |
| `OPENAI_MODERATION_MODEL` | No    | string  | `omni-moderation-latest`                     | Modelo de OpenAI Moderation API                             |
| `PERSPECTIVE_API_KEY` | No        | string  | -                                            | Clave opcional para Google Perspective API (cuota gratuita) |
| `SMTP_HOST`         | No        | string  | -                                            | Host del servidor SMTP (Mailtrap Sandbox en dev, Brevo en staging/prod) |
| `SMTP_PORT`         | No        | int     | `587`                                       | Puerto del servidor SMTP (587 STARTTLS, 465 TLS implícito, 2525 Mailtrap) |
| `SMTP_USER`         | No        | string  | -                                            | Usuario de autenticación SMTP. En Brevo es el login de la cuenta o `<id>@smtp-brevo.com` |
| `SMTP_PASSWORD`     | No        | string  | -                                            | Contraseña SMTP. En Brevo es la **SMTP key**, no la API key |
| `SMTP_FROM`         | No        | string  | -                                            | Dirección de origen de los correos transaccionales |
| `SMTP_FROM_NAME`    | No        | string  | -                                            | Nombre mostrado en el origen (ej. `DolyNation Editorial`) |
| `SMTP_SECURE`       | No        | boolean | `false`                                     | `true` solo para TLS implícito (puerto 465). En el resto de puertos se usa STARTTLS |
| `FRONTEND_BASE_URL` | No        | url     | `http://localhost:3000`                    | Base pública del frontend. Se usa para construir los enlaces de los correos |
| `EMAIL_VERIFICATION_REQUIRED` | No | boolean | `false`                            | Cuando es `true`, iniciar sesión exige que el usuario haya confirmado su correo |

Las variables de TTS se definirán en `back#11`; no agregues nombres nuevos
hasta que el proveedor esté decidido.

### Correo (SMTP)

El proveedor de correo es **solo configuración**: el cliente SMTP es el mismo
en todos los ambientes, así que pasar de Mailtrap a Brevo (o a Mailpit en local)
es cambiar valores, no código.

| Ambiente     | Host                            | Puerto | Notas                                        |
| ------------ | ------------------------------- | ------ | -------------------------------------------- |
| local        | `localhost` (Mailpit)           | `1025` | Sin credenciales; se ve en `http://localhost:8025` |
| desarrollo   | `sandbox.smtp.mailtrap.io`      | `2525` | Mailtrap Sandbox: captura el correo, no llega a buzones reales |
| staging      | `smtp-relay.brevo.com`          | `587`  | Brevo. La contraseña es la **SMTP key**      |
| produccion   | `smtp-relay.brevo.com`          | `587`  | Brevo. La contraseña es la **SMTP key**      |

Los valores de cada ambiente llegan como **secrets** del GitHub Environment
correspondiente (`desarrollo`, `staging`, `prod`) y los escribe el workflow de
despliegue. **Nunca** se comitean credenciales: ni en el repo, ni en un `.env`
versionado, ni en el historial de git.

Las variables `SMTP_*` son opcionales a propósito: sin ellas la aplicación
arranca igual y solo falla el envío, con un mensaje claro en el log del
servidor (`falta SMTP_HOST` / `falta SMTP_FROM`).

## Política de secretos

1. **Nunca** commitear `.env` ni `.env.production`. El `.gitignore` raíz
   bloquea `*/.env` y `*/.env.production`.
2. **Generar** `JWT_SECRET` con: `openssl rand -base64 48`
3. **Rotar** secretos cada 90 días en producción (proceso manual).
4. **Diferenciar** dev / staging / prod con archivos separados:
   `.env.development`, `.env.production`, etc.

## Validación

Las variables se validan al arrancar con un schema Zod en
[`src/config/env.validation.ts`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/config/env.validation.ts).
Si falta una variable requerida o tiene un valor inválido, la app **no
arranca** y muestra el error exacto.

## Cómo arrancar en local

```bash
# En el repo del backend (dolynation-atl-back):
cp .env.example .env
# Editar .env y rellenar DB_PASSWORD, JWT_SECRET, MINIMAX_API_KEY, etc.
```

Para la BD de desarrollo, se usa el
[`docker-compose.test.yml`](https://github.com/DolyLanguagesORG/dolynation-tlalli-infra/blob/develop/docker-compose.test.yml)
del repo de infraestructura:

```bash
git clone https://github.com/DolyLanguagesORG/dolynation-tlalli-infra.git
cd dolynation-tlalli-infra
docker compose -f docker-compose.test.yml up -d
```

El schema se aplica automáticamente al primer arranque del contenedor.
