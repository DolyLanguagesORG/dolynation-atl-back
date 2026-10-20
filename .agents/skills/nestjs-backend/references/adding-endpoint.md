# Añadir un endpoint

Pasos para exponer una ruta nueva respetando el contrato del backend.

## 1. DTO(s) de entrada/salida — `src/modules/<feature>/dto/`

```ts
// create-thing.dto.ts
export class CreateThingDto {
  @ApiProperty({ description: 'Thing name', example: 'Lectura 1' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
```

- `@ApiProperty({ description, example })` en **inglés** (contrato público).
- Validación con `class-validator` (`@IsString`, `@IsUUID`, `@IsEnum`, …).
- `!` en campos type-only (strict mode).
- Nombre del archivo y de la clase terminan en `...Dto` / `...ResponseDto`.

## 2. Lógica en el service — `*.service.ts`

- Toda la lógica de negocio y el acceso a datos viven aquí (no en el controller).
- Acceso a DB vía el cliente Drizzle inyectado.
- Lanza errores con `AppHttpException(ErrorCode.X, ...)` cuando corresponda
  (`references/adding-error-code.md` si falta el código).

## 3. Método en el controller — `*.controller.ts`

```ts
@Post()
@ApiOperation({ summary: 'Create a thing' })
@ApiCreatedResponseOf(CreateThingResponseDto)
@ApiBadRequestResponse({ type: ApiErrorDto })
create(@Body() dto: CreateThingDto) {
  return this.service.create(dto);
}
```

- `@ApiTags` a nivel de controller (ya suele estar).
- `@ApiBearerAuth('access-token')` salvo que sea `@Public()`.
- Responde con helper (`apiOk`/`apiCreated`) o devuelve el resultado del service
  si el interceptor lo envuelve — **mantén el patrón del módulo existente**.
- Documenta todos los errores posibles con `@Api*Response({ type: ApiErrorDto })`.

## 4. Códigos de error

Si el flujo introduce un caso de error nuevo, añádelo al catálogo antes de
usarlo: `references/adding-error-code.md`.

## 5. Tests

- Unit (`*.spec.ts`): caso feliz + casos de error del service.
- e2e (`test/`): si el endpoint cambia el **contrato** público (nuevo campo,
  nuevo error), y para confirmar que la respuesta va envuelta.
- Recuerda que el e2e `openapi-envelope` verifica el envelope.

## 6. Verificar y actualizar OpenAPI

```bash
npm run verify
```

Si el contrato cambió (rutas, DTOs, respuestas), actualiza el **snapshot de
OpenAPI** que valida el check `openapi-guard` (se genera desde los decoradores).
Revisa el workflow `.github/workflows/` para el comando exacto del guard.
