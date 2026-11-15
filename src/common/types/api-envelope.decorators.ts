import type { Type } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiCreatedResponse, ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiSuccessEnvelopeDto } from './api-response.dto';

/**
 * Decoradores auxiliares que documentan el sobre estándar `{ message, data, error }`
 * en la especificación OpenAPI consumida por Scalar.
 *
 * Por qué existen
 * ----------------
 * Todos los controladores envuelven su respuesta con `apiOk(message, data)`, así que el
 * formato real en la red siempre tiene esta estructura:
 *
 *   { "message": "...", "data": {...}, "error": null }
 *
 * Si se usara directamente `@ApiOkResponse({ type: ReadingDto })`, Scalar mostraría el
 * cuerpo como `ReadingDto` sin el envoltorio, desalineado de la respuesta real.
 *
 * Cada helper genera un esquema `allOf` que combina:
 *   1. `$ref` hacia `ApiSuccessEnvelopeDto` (contiene `message`, `error: null` y el
 *      marcador genérico `data`), y
 *   2. Un override inline que fija `data` al modelo concreto, a un arreglo de ese modelo
 *      o a `null` para endpoints sin contenido útil (como logout o borrado lógico).
 *
 * `ApiExtraModels` es obligatorio para que las referencias `$ref` anidadas se
 * registren dentro de `components.schemas` en la especificación generada.
 */
type ModelCtor = Type<unknown>;

/** Construye el esquema OpenAPI `allOf` que envuelve el payload dentro de `data`. */
const envelopeAllOfSchema = (modelSchema: Record<string, unknown>): Record<string, unknown> => ({
  allOf: [
    { $ref: getSchemaPath(ApiSuccessEnvelopeDto) },
    {
      type: 'object',
      properties: {
        data: modelSchema,
      },
    },
  ],
});

/** Respuesta 200 OK con un objeto único en `data`. */
export const ApiOkResponseOf = (model: ModelCtor): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, model),
    ApiOkResponse({
      description: 'Sobre estándar de respuesta exitosa.',
      schema: envelopeAllOfSchema({ $ref: getSchemaPath(model) }),
    }),
  );

/** Respuesta 201 Created con un objeto único en `data`. */
export const ApiCreatedResponseOf = (model: ModelCtor): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, model),
    ApiCreatedResponse({
      description: 'Sobre estándar de recurso creado exitosamente.',
      schema: envelopeAllOfSchema({ $ref: getSchemaPath(model) }),
    }),
  );

/** Respuesta 200 OK con un arreglo tipado de elementos en `data`. */
export const ApiOkResponseOfArray = (item: ModelCtor): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, item),
    ApiOkResponse({
      description: 'Sobre estándar de respuesta exitosa que envuelve una lista.',
      schema: envelopeAllOfSchema({
        type: 'array',
        items: { $ref: getSchemaPath(item) },
      }),
    }),
  );

/** Respuesta 2xx con `data: null` (usada por endpoints 204 o sin carga útil que conservan el sobre). */
export const ApiOkResponseEmpty = (): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto),
    ApiOkResponse({
      description: 'Sobre estándar de respuesta exitosa con carga nula (`data: null`).',
      schema: envelopeAllOfSchema({ type: 'null', nullable: true }),
    }),
  );
