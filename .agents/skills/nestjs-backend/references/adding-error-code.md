# Añadir un código de error

El catálogo vive en `src/common/errors/error-codes.ts` y es **contrato público**:
el front decisiona por `error.code`.

## Pasos

1. **Añade el código** al enum/objeto `ErrorCode`:

   ```ts
   export enum ErrorCode {
     // ...existentes
     READING_SELF_APPROVAL = 'READING_SELF_APPROVAL',
   }
   ```

   Usa `SCREAMING_SNAKE_CASE` con prefijo de área (`AUTH_`, `USER_`, `READING_`,
   `IA_`, `RESOURCE_`, …).

2. **Mapéalo a un HTTP status** donde el filtro resuelve el status por código
   (tabla/`Record<ErrorCode, HttpStatus>` en `common/errors/`). Elige el status
   correcto: 400/422 datos, 401 auth, 403 permiso, 404 no existe, 409 conflicto,
   422 semántica, 429 límite, 502/503 dependencias.

3. **Úsalo** con `AppHttpException`:

   ```ts
   throw new AppHttpException(
     ErrorCode.READING_SELF_APPROVAL,
     'A reading cannot be approved by its author',
   );
   ```

   Mensaje **seguro** y en **inglés**.

4. **Documenta** el error en el controller con
   `@Api*Response({ type: ApiErrorDto })` para el status elegido.

5. **Tests**: unit del service/branch que lo produce; e2e si el contrato cambia.

6. **Verifica**: `npm run verify`. Si el error aparece en el OpenAPI documentado,
   actualiza el snapshot del check `openapi-guard`.

## Reglas

- No reutilices un código para significados distintos.
- No crees un código para un error ya cubierto por uno genérico
  (`VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `INTERNAL_ERROR`).
- El `code` no cambia una vez publicado: si el significado cambia, crea uno nuevo.
