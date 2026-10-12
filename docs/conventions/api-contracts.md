# API contracts

Reglas del contrato HTTP del backend. **Toda respuesta**, éxito o error,
sigue un único envelope. Toda excepción se mapea a un código estable.

## ⚠️ TL;DR — Regla del envelope

**Toda respuesta del API — éxito o error — sigue este contrato:**

```ts
interface ApiResponse<T = unknown> {
  message: string;
  data: T;
  error?: ApiError;
}
```

Es **no negociable**. Ningún endpoint devuelve un objeto crudo; siempre
va envuelto con `apiOk()` o `apiFail()`. Esta regla está enforced por
[openapi-envelope.e2e-spec.ts](../../test/openapi-envelope.e2e-spec.ts)
en CI.

→ Detalles: [Siguiente sección](#envelope-de-respuesta)
→ Helpers:
[`apiOk`/`apiFail`](../../src/common/types/api-response.type.ts)
→ Test que la enforce:
[openapi-envelope](../../test/openapi-envelope.e2e-spec.ts)

## Envelope de respuesta

```ts
interface ApiResponse<T = unknown> {
  message: string;
  data: T;
  error?: ApiError;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

**Source of truth:**
[`src/common/types/api-response.type.ts`](../../src/common/types/api-response.type.ts)
(exporta los helpers `apiOk` y `apiFail`).

### Reglas

1. **Todo controller** envuelve su respuesta con `apiOk(message, data)`.
   Nunca devuelvas un objeto crudo.
2. **`message`** es un string legible para humanos, **en inglés**.
3. **`data`** contiene la carga útil del éxito o `null` en error.
4. **`error`** solo aparece en respuestas de fallo.

```ts
// ✅ Correcto
return apiOk('User registered successfully', newUser);

// ❌ Incorrecto
return newUser;
```

## Catálogo de códigos de error

Stable strings, no enum numbers. Cliente nunca debe parsear el `message`
— debe branchear sobre `code`.

**Source of truth:**
[`src/common/errors/error-codes.ts`](../../src/common/errors/error-codes.ts).
El test [`error-codes.spec.ts`](../../src/common/errors/error-codes.spec.ts)
verifica exhaustividad.

| Código                              | HTTP | Significado                                                  |
| ----------------------------------- | ---- | ------------------------------------------------------------ |
| `AUTH_INVALID_CREDENTIALS`          | 401  | Email o password incorrectos al login                        |
| `AUTH_TOKEN_EXPIRED`                | 401  | El JWT de acceso expiró, renovar con refresh                 |
| `AUTH_TOKEN_INVALID`                | 401  | El JWT es inválido (firma o formato)                         |
| `AUTH_EMAIL_ALREADY_EXISTS`         | 409  | Email ya registrado en signup                                |
| `AUTH_PASSWORD_TOO_WEAK`            | 400  | Password no cumple requisitos mínimos                        |
| `AUTH_UNAUTHORIZED`                 | 401  | Ruta protegida sin token válido                              |
| `RESOURCE_NOT_FOUND`                | 404  | Recurso no existe                                            |
| `RESOURCE_FORBIDDEN`                | 403  | Usuario autenticado pero sin permiso                         |
| `READING_PENDING_LIMIT_REACHED`     | 400  | Demasiadas lecturas pendientes, completar antes de generar    |
| `READING_ALREADY_EVALUATED`         | 400  | La lectura ya fue evaluada, no se puede re-evaluar           |
| `VALIDATION_ERROR`                  | 400  | Falló class-validator; `details.fields[]` con cada campo    |
| `INTERNAL_ERROR`                    | 500  | Error no controlado; el cliente no recibe detalles internos  |
| `SERVICE_UNAVAILABLE`               | 503  | Dependencia externa (DB, AI provider) caída                  |

### Añadir un código nuevo

Pasos en [onboarding/adding-error-code.md](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/onboarding/adding-error-code.md).

## Cómo lanzar errores en el código

**No** uses `throw new NotFoundException('msg')` directo de NestJS. Usa:

```ts
import { AppHttpException } from '@/common/errors/app-http.exception';
import { ErrorCode } from '@/common/errors/error-codes';

throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, 'Reading not found');
```

**Source of truth:**
[`src/common/errors/app-http.exception.ts`](../../src/common/errors/app-http.exception.ts).

El helper `httpError(code, details?)` acorta aún más:

```ts
throw httpError(ErrorCode.VALIDATION_ERROR, { fields: [...] });
```

## Regla de seguridad: nunca leakear detalles internos

El filtro
[`src/common/errors/all-exceptions.filter.ts`](../../src/common/errors/all-exceptions.filter.ts)
garantiza que cualquier `Error` genérico se mapea a `INTERNAL_ERROR` con
mensaje genérico. **Nunca** incluir en el `message`:

- Queries SQL
- Paths del filesystem
- Stack traces
- Variables de entorno
- Mensajes de librerías externas crudos

El log server-side tiene el contexto completo (vía `nestjs-pino`); el
cliente solo recibe un código estable + mensaje seguro.

## Documentación OpenAPI

- **Scalar UI**: `http://localhost:3333/docs`
- **OpenAPI JSON**: `http://localhost:3333/api/v1/openapi.json`

Config en [`src/main.ts`](../../src/main.ts):

- Title: `Dolynglish API`
- Auth: Bearer JWT (scheme `http`, format `JWT`)
- Theme: `purple`

### Idioma de las descripciones

**Todas las descripciones de DTOs, parámetros y operaciones van en inglés.**
Esto se mantiene deliberadamente aunque los docs internos estén en español:

- Es el idioma estándar de OpenAPI/Swagger.
- Los clientes externos (mobile, integraciones) leen en inglés.
- Los mensajes de error del catálogo están en inglés por la misma razón.

### Decoradores a usar en controllers

```ts
@ApiTags('auth')
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Register a new user', description: '...' })
@ApiCreatedResponseOf(AuthResponseDto)
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@Post('register')
async register(@Body() dto: RegisterDto): Promise<ApiResponse<AuthResponseDto>> {
  return apiOk('User registered successfully', await this.auth.register(dto));
}
```

Los helpers envelope están en
[`src/common/types/api-envelope.decorators.ts`](../../src/common/types/api-envelope.decorators.ts):

- `ApiOkResponseOf(ModelDto)`
- `ApiCreatedResponseOf(ModelDto)`
- `ApiOkResponseOfArray(ItemDto)`
- `ApiOkResponseEmpty()`

Guía paso a paso para añadir un endpoint en
[onboarding/adding-endpoint.md](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/onboarding/adding-endpoint.md).