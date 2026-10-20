# Testing

Framework: **Jest** (+ `ts-jest`, + `supertest` para e2e).

## Tipos de test y ubicación

| Tipo | Ubicación | Config | Necesita Postgres |
| ---- | --------- | ------ | ----------------- |
| Unit | `*.spec.ts` **co-localizados** en `src/` | `jest.config.ts` | No |
| e2e  | `test/*.e2e-spec.ts` | `test/jest-e2e.json` | **Sí** |

Estado actual: **71 tests unitarios** + la suite e2e.

## Comandos

```bash
npm run test         # todos (unit)
npm run test:watch   # modo watch
npm run test:cov     # con cobertura
npm run test:e2e     # e2e (--config ./test/jest-e2e.json)
npm run verify       # lo que corre CI antes de mergear (sin e2e)
```

## e2e en local

Necesita PostgreSQL 15 levantado y el schema aplicado:

```bash
# 1) levantar Postgres de test (repo dolynation-tlalli-infra)
docker compose -f docker-compose.test.yml up -d
# 2) aplicar el schema
psql ... -f ../dolynation-tlalli-infra/database/postgres/01-init.sql
# 3) correr
npm run test:e2e
```

## Qué testear según el cambio

| Cambio | Debes añadir |
| ------ | ------------ |
| Bug | Test de **regresión** que falle sin el fix (unit si es posible). |
| Endpoint nuevo | Unit del service (feliz + errores) y e2e del contrato. |
| Regla de negocio | Unit del service con los casos límite. |
| Validación de DTO | Unit o e2e (que el DTO inválido devuelva `VALIDATION_ERROR`). |
| Código de error nuevo | Unit del branch + e2e si cambia el contrato. |
| Refactor sin cambio de comportamiento | Los tests existentes deben seguir pasando (no los relajes). |

## Guardarraíles de contrato (en CI)

El workflow **`openapi-guard`** corre contra Postgres real:

```
npx jest --config ./test/jest-e2e.json \
  openapi-envelope openapi-response-coverage bootstrap-ordering
```

- **`openapi-envelope`**: toda respuesta respeta el envelope `{message,data,error?}`.
- **`openapi-response-coverage`**: cada respuesta está documentada (decoradores).
- **`bootstrap-ordering`**: el orden de bootstrap (config/validación) es correcto.

Si cambias el contrato público, estos tests y el snapshot de OpenAPI deben
actualizarse en el mismo PR.
