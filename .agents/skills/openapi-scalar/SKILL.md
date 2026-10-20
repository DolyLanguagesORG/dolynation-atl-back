---
name: openapi-scalar
description: Guidelines and conventions for documenting NestJS endpoints with OpenAPI and Scalar in Dolynglish backend. Explains @ApiTags, @ApiOperation, @ApiBearerAuth, envelope response decorators (ApiOkResponseOf, ApiCreatedResponseOf, ApiOkResponseEmpty), error documentation with ApiErrorDto, and how to verify with openapi-* tests.
---

# OpenAPI & Scalar Documentation Skill

Guía de referencia para documentar endpoints de NestJS con OpenAPI y Scalar en el repositorio `dolynation-atl-back`. Aplica para los endpoints del Sprint 1 y todos los siguientes sprints (S2-S5).

## Ubicación de la Documentación en Vivo

- **Scalar UI**: `http://localhost:3333/docs`
- **OpenAPI JSON**: `http://localhost:3333/api/v1/openapi.json`

---

## 1. Reglas Fundamentales

1. **Idioma**: Todas las descripciones (`@ApiOperation`, `@ApiProperty`, mensajes de error) van en **inglés**.
2. **El Envelope de Respuesta Obligatorio**: Ningún endpoint devuelve objetos sueltos. Todas las respuestas de éxito y error están envueltas en:
   ```ts
   interface ApiResponse<T> {
     message: string;
     data: T;
     error?: ApiError;
   }
   ```
3. **Cero "Nobody" en Scalar**: Toda respuesta exitosa (200 o 201) debe referenciar un DTO con esquema real utilizando los decoradores de envelope.

---

## 2. Decoradores de Respuesta (Envelope)

Importados desde `src/common/types/api-envelope.decorators`:

| Caso de Uso | Decorador a Usar | Código HTTP |
| :--- | :--- | :--- |
| Devolver un objeto | `@ApiOkResponseOf(MiRespuestaDto)` | 200 OK |
| Crear un recurso | `@ApiCreatedResponseOf(MiRespuestaDto)` | 201 Created |
| Devolver un arreglo / lista | `@ApiOkResponseOfArray(ItemDto)` | 200 OK |
| Sin contenido o datos nulos (ej. logout, delete) | `@ApiOkResponseEmpty()` | 204 No Content / 200 |

---

## 3. Documentación de Errores

Todos los errores documentados deben usar el DTO estándar `ApiErrorDto`:

```typescript
@ApiBadRequestResponse({ description: 'Validation failed', type: ApiErrorDto })
@ApiUnauthorizedResponse({ description: 'Missing or invalid token', type: ApiErrorDto })
@ApiNotFoundResponse({ description: 'Resource not found', type: ApiErrorDto })
@ApiConflictResponse({ description: 'Resource already exists', type: ApiErrorDto })
```

---

## 4. Ejemplo Completo de un Endpoint Nuevo

```typescript
import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBadRequestResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiCreatedResponseOf } from '@/common/types/api-envelope.decorators';
import { ApiErrorDto } from '@/common/errors/api-error.dto';
import { apiOk, type ApiResponse } from '@/common/types/api-response.type';

@ApiTags('example')
@ApiBearerAuth('access-token')
@Controller('example')
export class ExampleController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new resource' })
  @ApiCreatedResponseOf(ExampleResponseDto)
  @ApiBadRequestResponse({ description: 'Validation failed', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Unauthorized', type: ApiErrorDto })
  async create(@Body() dto: CreateExampleDto): Promise<ApiResponse<ExampleResponseDto>> {
    const created = await this.service.create(dto);
    return apiOk('Resource created successfully', created);
  }
}
```

---

## 5. Verificación y Tests

Antes de subir cualquier endpoint a GitHub, verificar que los tests pasen:

```bash
npx jest test/openapi-schema.e2e-spec.ts
npx jest test/openapi-envelope.e2e-spec.ts
npx jest test/openapi-response-coverage.e2e-spec.ts
```
