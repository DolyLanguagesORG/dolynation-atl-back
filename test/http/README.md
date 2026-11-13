# Suite HTTP manual del backend (`test/http`)

Colección de escenarios ejecutables con **VS Code REST Client** o **JetBrains HTTP Client** (con soporte de scripts de respuesta para capturar tokens e IDs entre pasos), alineada 1:1 con [`docs/qa/BACKEND-FLOWS-TEST-PLAN.md`](../../docs/qa/BACKEND-FLOWS-TEST-PLAN.md).

## Entornos

Definidos en `http-client.env.json`:

- `local`: `http://localhost:3333/api/v1` (`npm run start:dev`)
- `docker`: `http://localhost:57011/api/v1` (contenedor `doly-dev-backend`)

## Archivos disponibles

| Archivo | Flujo que valida |
|---|---|
| `01-test-1-subscription-gate.http` | Test 1: bloqueo global `403 SUBSCRIPTION_REQUIRED` antes de elegir plan (incluyendo `/auth/me` y `GET /user/subscription`) |
| `02-test-2-pending-readings-limit.http` | Test 2: límite máximo de 3 lecturas pendientes sin evaluar |
| `03-test-3-basic-language-lock.http` | Test 3: plan `dolly` restringido al idioma seleccionado + candado anual/pago |
| `04-test-4-plus-language-double-change.http` | Test 4: plan `dolly_plus` rechaza 2 cambios seguidos sin nuevo pago o 365 días |
| `05-test-5-daily-limits-all-tiers.http` | Test 5: límites diarios por plan (`10` / `20` / ilimitado) y conteo de lecturas eliminadas |
| `06-test-6-logout-all-devices-session.http` | Test 6: multi-dispositivo tras `logout-all` (access token vigente vs `refresh` revocado) |
| `07-test-7-pro-downgrade-language-loss.http` | Test 7: pérdida de acceso a idiomas al bajar desde `dolly_pro` a `dolly_plus`/`dolly` |
| `08-four-languages-dynamic-categories-quality.http` | Generación, evaluación y explicación real en `es`, `en`, `fr`, `it` con categorías dinámicas y 3 dificultades |
| `09-test-8-category-moderation-and-daily-limit.http` | Tests 8 y 9: bloqueo de categorías dañinas/ofuscadas/gibberish/injection, caché Postgres `$0` IA y tope diario de 20/día (`429 CATEGORY_DAILY_LIMIT_REACHED`) |

> Recomendación: si usas la extensión REST Client sin JetBrains client scripts, actualiza las variables `@accessToken`, `@readingId`, etc., o ejecuta los flujos automáticos completos con `npm run test:e2e`.
