# Testing

El backend usa Jest con ts-jest. Hay dos tipos de tests:

## Unit tests (co-localizados)

- Archivos: `*.spec.ts` junto al código que prueban.
- Corren con `npm run test` o `npm run test:watch`.
- Configuración: [`jest.config.ts`](../../jest.config.ts).

Ejemplos actuales:

- [`src/common/errors/error-codes.spec.ts`](../../src/common/errors/error-codes.spec.ts) —
  verifica que **cada** código del catálogo tiene `code`, `status` y `message`.
- [`src/common/errors/all-exceptions.filter.spec.ts`](../../src/common/errors/all-exceptions.filter.spec.ts) —
  verifica que el filtro **no leak** mensajes internos (SQL, secrets, paths)
  en respuestas de error.
- `src/modules/auth/auth.service.spec.ts`, etc.

## E2E tests (en `test/`)

- Archivos: `*.e2e-spec.ts` en [`test/`](../../test/).
- Corren con `npm run test:e2e` (config: [`test/jest-e2e.json`](../../test/jest-e2e.json)).
- Construyen `AppModule` completo y verifican el comportamiento end-to-end
  (HTTP request → respuesta).

Tests de regresión críticos (NO romper):

- [`openapi-envelope.e2e-spec.ts`](../../test/openapi-envelope.e2e-spec.ts) —
  cada respuesta 2xx debe usar el patrón `allOf` con `ApiSuccessEnvelopeDto`.
- [`openapi-response-coverage.e2e-spec.ts`](../../test/openapi-response-coverage.e2e-spec.ts) —
  cada respuesta 2xx debe tener schema real (no placeholders), y cada
  `$ref` debe resolver en `components.schemas`.
- [`bootstrap-ordering.e2e-spec.ts`](../../test/bootstrap-ordering.e2e-spec.ts) —
  verifica que `setGlobalPrefix` corre antes que `createDocument`
  (regresión del bug que rompía `/docs` en producción).
- [`openapi-schema.e2e-spec.ts`](../../test/openapi-schema.e2e-spec.ts),
  [`readings-request-body.e2e-spec.ts`](../../test/readings-request-body.e2e-spec.ts) —
  contratos específicos.

## Qué testear

✅ **SÍ**:

- Lógica de catálogo de errores (cada `ErrorCode` mapea a status correcto).
- Filtro de excepciones (incluyendo el caso de no-leak de mensajes internos).
- Parsers, formateadores, validadores custom.
- Servicios con decisiones de negocio (e.g. `ReadingsService`).
- Contratos HTTP completos (e2e).

❌ **NO**:

- Wrappers triviales alrededor de una sola llamada a la BD.
- DTOs sin lógica.
- Constantes y enums.
- Configuración de módulos de NestJS (es boilerplate del framework).

## Política por tipo de cambio

| Tipo de cambio            | Test requerido                                              |
| ------------------------- | ----------------------------------------------------------- |
| `feat`                    | Al menos un test que **falle** sin el cambio                 |
| `fix`                     | Un test que reproduce el bug + verifica el fix               |
| `refactor`                | Tests existentes deben seguir pasando sin modificación      |
| `docs`                    | Ninguno                                                     |
| `chore` (deps, build)     | Verificar que `npm run verify` pasa                         |
| `feat` que añade endpoint | Unit + e2e con `supertest`                                  |

## Cobertura

Hoy no hay umbral numérico. Se recopila coverage al correr
`npm run test:cov` pero no se exige % mínimo. La política es **revisión
manual** hasta tener base más grande.

Cuando se introduzca umbral (recomendado para 2026), los mínimos sugeridos
son:

- Statements / Branches / Functions: **70%**
- Lines: **75%**

Aplicable solo a `src/` (no contar `main.ts` ni specs).

## Mocks

- Para Drizzle / pg, mockear el provider `DRIZZLE` con un objeto que
  expone las mismas funciones (`.select()`, `.insert()`, etc.).
- Para HTTP en e2e, no mockear — usar `supertest` contra
  `app.getHttpServer()`.
- Para providers externos de IA (`MiniMax-M3`, `groq`), mockear las interfaces
  `IAiProvider`.

## Helpers y fixtures

Si un test necesita datos, prefiere factories locales al inicio del archivo:

```ts
const makeUser = (overrides: Partial<User> = {}): User => ({
  id: '1',
  email: 'a@b.com',
  ...overrides,
});
```

No compartas fixtures globales entre specs — los tests deben poder correr
aislados.