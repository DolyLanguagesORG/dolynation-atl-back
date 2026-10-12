/**
 * E2E coverage guard: every endpoint that can return 200 or 201 must
 * document that success response with a real schema in the OpenAPI
 * document served at /api/v1/openapi.json.
 *
 * Historical bug (2026-08-30): several controllers annotated success
 * responses with `@ApiOkResponse({ description: 'Some text' })` only.
 * Scalar rendered them as the placeholder "Nobody" (no schema, no
 * fields), and "Try it" produced no example body, so mobile clients
 * could not preview the success payload without first calling the
 * endpoint. This test asserts every success response carries a real
 * schema (object/array with a $ref to a documented component, or a
 * non-empty inline schema) so the regression cannot happen again.
 *
 * Endpoints that legitimately return no body (HTTP 204) are excluded.
 */
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/env.config';

interface OpenApiSchemaObject {
  $ref?: string;
  type?: string;
  items?: OpenApiSchemaObject;
  properties?: Record<string, OpenApiSchemaObject>;
  additionalProperties?: unknown;
  nullable?: boolean;
  allOf?: OpenApiSchemaObject[];
  oneOf?: OpenApiSchemaObject[];
  anyOf?: OpenApiSchemaObject[];
  example?: unknown;
  description?: string;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchemaObject }>;
}

interface OpenApiOperation {
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchemaObject> };
}

const mockEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '0',
  HOST: '127.0.0.1',
  API_PREFIX: 'api/v1',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_USER: 'test',
  DB_PASSWORD: 'test',
  DB_DATABASE: 'test',
  JWT_SECRET: 'a'.repeat(64),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  AI_DEFAULT_PROVIDER: 'minimax',
  MINIMAX_API_KEY: 'sk-test',
  MINIMAX_MODEL: 'MiniMax-M3',
  MINIMAX_ENDPOINT: 'https://api.test/v1/chat',
  MINIMAX_TIMEOUT_MS: '30000',
  MINIMAX_MAX_TOKENS: '4096',
  MINIMAX_TEMPERATURE: '0.6',
};

describe('every endpoint documents its success response shape', () => {
  let app: INestApplication;
  let document: OpenApiDocument;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('ConfigService')
      .useValue({ get: (key: string): string => mockEnv[key] ?? '' })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useLogger({
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      verbose: () => undefined,
      fatal: () => undefined,
    });

    // Match main.ts: prefix first, then build the document, then validation pipe.
    const env = app.get(AppConfigService);
    app.setGlobalPrefix(env.apiPrefix);

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Dolynglish API')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    document = SwaggerModule.createDocument(app, swaggerConfig) as unknown as OpenApiDocument;

    app.getHttpAdapter().get(`/${env.apiPrefix}/openapi.json`, (_req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json(document);
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * A success schema is "real" if it is:
   *   - a $ref to a documented component, OR
   *   - an inline object with at least one property, OR
   *   - an array of either of the above, OR
   *   - an allOf/oneOf/anyOf whose members collectively carry a real schema.
   *
   * Empty `{}` schemas, schemas without a $ref AND without properties, or
   * schemas that Scalar would render as "Nobody" all fail this check.
   *
   * Since 2026-09-01 this also accepts the envelope pattern
   * (`allOf: [{$ref: ApiSuccessEnvelopeDto}, {properties: {data: ...}}]`)
   * introduced by `feat(docs): document { message, data, error } envelope`.
   */
  const hasRealSchema = (schema: OpenApiSchemaObject | undefined): boolean => {
    if (!schema) return false;
    if (schema.$ref && schema.$ref.length > 0) return true;
    if (schema.allOf?.length) {
      return schema.allOf.every((member) => hasRealSchema(member));
    }
    if (schema.oneOf?.length || schema.anyOf?.length) {
      const variants = schema.oneOf ?? schema.anyOf ?? [];
      return variants.some((member) => hasRealSchema(member));
    }
    if (schema.type === 'array') {
      return hasRealSchema(schema.items);
    }
    if (schema.type === 'object' || schema.properties) {
      return Object.keys(schema.properties ?? {}).length > 0;
    }
    if (
      schema.type === 'string' ||
      schema.type === 'number' ||
      schema.type === 'boolean' ||
      schema.type === 'integer'
    ) {
      return true;
    }
    return false;
  };

  const collectSuccessResponses = (): Array<{
    method: string;
    path: string;
    status: string;
    response: OpenApiResponse;
  }> => {
    const collected: Array<{
      method: string;
      path: string;
      status: string;
      response: OpenApiResponse;
    }> = [];
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const [method, op] of Object.entries(methods ?? {})) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        for (const [status, response] of Object.entries(op.responses ?? {})) {
          if (status === '200' || status === '201') {
            collected.push({ method: method.toUpperCase(), path, status, response });
          }
        }
      }
    }
    return collected;
  };

  it('every documented success response carries a real schema (no "Nobody")', () => {
    const successResponses = collectSuccessResponses();
    expect(successResponses.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const { method, path, status, response } of successResponses) {
      const jsonSchema = response.content?.['application/json']?.schema;
      if (!hasRealSchema(jsonSchema)) {
        offenders.push(
          `${method} ${path} → ${status} (description: "${response.description ?? ''}")`,
        );
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Endpoints with undocumented success response (Scalar will show "Nobody"):\n  - ${offenders.join('\n  - ')}`,
      );
    }
  });

  it('every $ref in a success response points to a documented component', () => {
    const successResponses = collectSuccessResponses();
    const schemaNames = new Set(Object.keys(document.components?.schemas ?? {}));
    expect(schemaNames.size).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const { method, path, status, response } of successResponses) {
      const jsonSchema = response.content?.['application/json']?.schema;
      if (!jsonSchema) continue;
      const refs = collectRefs(jsonSchema);
      for (const ref of refs) {
        if (!schemaNames.has(ref)) {
          missing.push(`${method} ${path} → ${status} references missing schema "${ref}"`);
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Success responses reference schemas that are not in components.schemas:\n  - ${missing.join('\n  - ')}`,
      );
    }
  });

  it('every documented success schema has at least one documented field', () => {
    const schemas = document.components?.schemas ?? {};
    for (const [name, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      if (!hasRealSchema(schema)) {
        throw new Error(`Documented schema "${name}" has no fields (Scalar will show "Nobody")`);
      }
    }
  });

  it('live OpenAPI: /api/v1/openapi.json carries an envelope schema for POST /api/v1/auth/register', async () => {
    const response = await supertest(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
    const live = response.body as OpenApiDocument;
    const registerPost = live.paths?.['/api/v1/auth/register']?.post;
    const created = registerPost?.responses?.['201'];
    expect(created).toBeDefined();
    const schema = created?.content?.['application/json']?.schema;
    // Since 2026-09-01 every 2xx response uses the allOf envelope pattern.
    expect(schema).toBeDefined();
    expect(hasRealSchema(schema)).toBe(true);
  });
});

function collectRefs(schema: OpenApiSchemaObject): string[] {
  const refs: string[] = [];
  if (schema.$ref) refs.push(schema.$ref.replace('#/components/schemas/', ''));
  if (schema.allOf) for (const member of schema.allOf) refs.push(...collectRefs(member));
  if (schema.oneOf) for (const member of schema.oneOf) refs.push(...collectRefs(member));
  if (schema.anyOf) for (const member of schema.anyOf) refs.push(...collectRefs(member));
  if (schema.items) refs.push(...collectRefs(schema.items));
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      refs.push(...collectRefs(prop));
    }
  }
  return refs;
}
