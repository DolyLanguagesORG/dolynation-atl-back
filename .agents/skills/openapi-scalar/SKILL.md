---
name: openapi-scalar
description: Cómo documentar y verificar la API de DolyNation (repo dolynation-atl-back) con OpenAPI, Swagger y Scalar. Cubre decoradores, envelope, DTOs, errores, /docs, /api/v1/openapi.json y los tests openapi-*. Úsala al crear/modificar endpoints o cuando la documentación de la API falle en CI.
---

# OpenAPI + Scalar — `dolynation-atl-back`

## Qué ya está instalado

- `@nestjs/swagger` + `@scalar/nestjs-api-reference`.
- Scalar UI en `/docs`.
- JSON OpenAPI en `/api/v1/openapi.json`.
- Tests: `test/openapi-envelope.e2e-spec.ts`,
  `test/openapi-response-coverage.e2e-spec.ts`,
  `test/openapi-schema.e2e-spec.ts`.
- CI: `.github/workflows/openapi-guard.yml`.

No hace falta “instalar OpenAPI”; el trabajo es mantener la cobertura y la
calidad de los schemas.

## Reglas de documentación

- Descripciones de DTOs, parámetros y operaciones **en inglés**.
- Todo endpoint lleva `@ApiTags`, `@ApiBearerAuth('access-token')` (salvo
  públicos) y `@ApiOperation({ summary })`.
- Toda respuesta 2xx usa un helper de envelope:
  `@ApiOkResponseOf(Dto)`, `@ApiCreatedResponseOf(Dto)` o
  `@ApiOkResponseOfArray(Dto)`.
- Toda respuesta de error documentada con `type: ApiErrorDto`:
  `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`,
  `@ApiNotFoundResponse`, `@ApiConflictResponse`, etc.
- El schema de respuesta debe tener campos reales; si Scalar muestra
  “Nobody”, falta el DTO o el decorador.
- No agregues `servers` con `/api/v1` en Scalar: los paths ya llevan el prefijo
  y se duplicaría.

## Ejemplo

```ts
@ApiTags('readings')
@ApiBearerAuth('access-token')
@Controller('readings')
export class ReadingsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a reading from study parameters' })
  @ApiCreatedResponseOf(ReadingDto)
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorDto })
  async generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateReadingDto) {
    // ...
  }
}
```

DTO:

```ts
export class GenerateReadingDto {
  @ApiProperty({ enum: ['en', 'fr', 'es', 'it'], example: 'en' })
  @IsIn(['en', 'fr', 'es', 'it'])
  language!: string;
}
```

## Verificación

```bash
npx jest --config ./test/jest-e2e.json openapi-envelope openapi-response-coverage openapi-schema
npm run verify
```

Manual:

```bash
npm run start:dev
# Abrir http://localhost:3333/docs
curl -s http://localhost:3333/api/v1/openapi.json | head
```

Revisa que:

- Todos los endpoints del sprint aparezcan en `/docs`.
- Cada 2xx tenga schema (no “Nobody”).
- Los errores documentados coincidan con `ErrorCode`.
- El prefijo `/api/v1` aparezca una sola vez.

## Errores comunes

- **Ruta duplicada `/api/v1/api/v1`:** agregaste `servers` con el prefijo.
- **“Nobody” en Scalar:** falta `@ApiOkResponseOf` o el DTO no tiene
  `@ApiProperty`.
- **El test de cobertura falla:** hay un endpoint 2xx sin decorador de
  respuesta.
- **El test de envelope falla:** el controller devuelve un objeto crudo en vez
  de `apiOk`/`apiCreated`.
- **El endpoint no aparece con el prefijo:** `setGlobalPrefix` debe ejecutarse
  antes de `SwaggerModule.createDocument` (ver `src/main.ts`).

## Referencias

- [conventions/api-contracts.md](../../../docs/conventions/api-contracts.md)
- [onboarding/adding-endpoint.md](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/onboarding/adding-endpoint.md)
- [main.ts](../../../src/main.ts)
- [openapi-guard.yml](../../../.github/workflows/openapi-guard.yml)
