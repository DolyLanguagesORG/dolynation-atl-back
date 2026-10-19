# Envelope y códigos de error

**Toda** respuesta del backend usa un envelope único. Es contrato público: los
frontends dependen de él.

## Envelope

Éxito:

```json
{ "message": "Readings retrieved", "data": [ /* ... */ ] }
```

Error:

```json
{
  "message": "Validation failed",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "fields": [{ "field": "email", "rules": ["isEmail"] }] }
  }
}
```

Tipos (en `src/common/types/`):

```ts
interface ApiResponse<T> {
  message: string;
  data: T | null;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
```

## Helpers de respuesta

Úsalos **siempre** en lugar de devolver objetos crudos:

```ts
return apiOk('Message in English', result);       // 200
return apiCreated('Created', result);             // 201
return apiOk('Deleted', null);                    // 200 sin payload
return apiFail(ErrorCode.X, 'safe message');      // normalmente vía throw
```

Decoradores de Swagger que acompañan (definen el schema de respuesta):
`ApiOkResponseOf(...)`, `ApiCreatedResponseOf(...)`, `ApiOkResponseOfArray(...)`,
`ApiOkResponseEmpty()`. Para errores: `@ApiBadRequestResponse({ type: ApiErrorDto })`,
`@ApiUnauthorizedResponse(...)`, `@ApiNotFoundResponse(...)`,
`@ApiInternalServerErrorResponse({ type: ApiErrorDto })`.

## Lanzar errores

Siempre con `AppHttpException`, nunca con las excepciones de Nest directas:

```ts
import { AppHttpException } from '@/common/errors/app-http.exception';
import { ErrorCode } from '@/common/errors/error-codes';

if (!user) {
  throw new AppHttpException(ErrorCode.USER_NOT_FOUND, 'User not found');
}
```

- El **`code`** es la parte estable del contrato; el `message` puede cambiar.
- El `message` debe ser **seguro** (sin detalles internos) y, por convención,
  en **inglés**.
- `details` es opcional; úsalo para datos accionables (p. ej. campos que fallan).

## Catálogo de `ErrorCode`

Fuente de verdad: `src/common/errors/error-codes.ts`. Cada código tiene su HTTP
status asociado en el filtro. Los principales:

| `code` | HTTP | Significado |
| ------ | ---- | ----------- |
| `VALIDATION_ERROR` | 400 | DTO inválido (`details.fields[]`). |
| `AUTH_INVALID_CREDENTIALS` | 401 | usuario/clave incorrectos. |
| `AUTH_TOKEN_EXPIRED` | 401 | access token expirado. |
| `AUTH_TOKEN_INVALID` | 401 | token malformado/firma inválida. |
| `AUTH_TOKEN_MISSING` | 401 | falta el header Bearer. |
| `AUTH_REFRESH_INVALID` | 401 | refresh token inválido/expirado. |
| `AUTH_UNAUTHORIZED` | 401/403 | sin permiso para el recurso. |
| `AUTH_EMAIL_ALREADY_EXISTS` | 409 | email ya registrado. |
| `USER_NOT_FOUND` | 404 | usuario inexistente. |
| `RESOURCE_NOT_FOUND` | 404 | recurso genérico inexistente. |
| `RESOURCE_FORBIDDEN` | 403 | recurso existe pero sin acceso. |
| `READING_PENDING_LIMIT_REACHED` | 400 | demasiadas lecturas pendientes. |
| `READING_ALREADY_EVALUATED` | 400 | la lectura ya fue evaluada. |
| `IA_PROVIDER_ERROR` | 502 | fallo del proveedor de IA. |
| `SERVICE_UNAVAILABLE` | 503 | dependencia caída. |
| `INTERNAL_ERROR` | 500 | fallback (no filtra detalle). |

Si necesitas un código nuevo, sigue `references/adding-error-code.md`.

## El filtro (`AllExceptionsFilter`)

- `AppHttpException` → usa su `code`/`message`/`details` y el status mapeado.
- Errores de Nest (`NotFoundException`, etc.) → se normalizan a un código del
  catálogo cuando es posible; el resto cae a `INTERNAL_ERROR`.
- Errores no controlados → `INTERNAL_ERROR` 500, con log completo del lado del
  servidor pero mensaje genérico hacia el cliente.

## Reglas rápidas

1. Devuelve siempre por helper (`apiOk`/`apiCreated`).
2. Lanza siempre `AppHttpException(ErrorCode.X, ...)`.
3. Nunca expongas SQL, rutas, secrets ni stack en `message`.
4. Decide en el cliente por `error.code`, nunca por `message`.
