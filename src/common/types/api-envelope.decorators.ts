import type { Type } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiCreatedResponse, ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiSuccessEnvelopeDto } from './api-response.dto';

/**
 * Decorator helpers that document the runtime `{ message, data, error }`
 * envelope in the OpenAPI spec consumed by Scalar.
 *
 * Why this exists
 * ----------------
 * Every controller wraps its payload via `apiOk(message, data)`, so the
 * wire format always looks like:
 *
 *   { "message": "...", "data": {...}, "error": null }
 *
 * But the previous docs annotated success responses with
 * `@ApiOkResponse({ type: ReadingDto })`, which tells Scalar the body is
 * `ReadingDto` directly. Scalar then rendered the example as a bare
 * reading object — exactly what users were seeing in /docs and reporting
 * as "the docs don't match the real API".
 *
 * Each helper here produces an `allOf` schema that combines:
 *   1. `$ref` to the shared `ApiSuccessEnvelopeDto` (carries `message`,
 *      `error: null` and the generic `data` placeholder), AND
 *   2. An inline override that pins `data` to the actual model — or to an
 *      array of that model, or to `null` for void endpoints (logout /
 *      soft-delete).
 *
 * `ApiExtraModels` is required so the nested `$ref`s resolve in the
 * `components.schemas` block of the generated spec. Both the envelope
 * DTO and the inner data model are registered every time.
 */
type ModelCtor = Type<unknown>;

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

/** 200 OK — single object payload. */
export const ApiOkResponseOf = (model: ModelCtor): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, model),
    ApiOkResponse({
      description: 'Standard success envelope.',
      schema: envelopeAllOfSchema({ $ref: getSchemaPath(model) }),
    }),
  );

/** 201 Created — single object payload. */
export const ApiCreatedResponseOf = (model: ModelCtor): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, model),
    ApiCreatedResponse({
      description: 'Standard success envelope.',
      schema: envelopeAllOfSchema({ $ref: getSchemaPath(model) }),
    }),
  );

/** 200 OK — array payload (typed item). */
export const ApiOkResponseOfArray = (item: ModelCtor): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto, item),
    ApiOkResponse({
      description: 'Standard success envelope wrapping a list.',
      schema: envelopeAllOfSchema({
        type: 'array',
        items: { $ref: getSchemaPath(item) },
      }),
    }),
  );

/** 2xx — `data: null` payload (used by 204 endpoints that still emit the envelope). */
export const ApiOkResponseEmpty = (): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(ApiSuccessEnvelopeDto),
    ApiOkResponse({
      description: 'Standard success envelope with a null payload.',
      schema: envelopeAllOfSchema({ type: 'null', nullable: true }),
    }),
  );
