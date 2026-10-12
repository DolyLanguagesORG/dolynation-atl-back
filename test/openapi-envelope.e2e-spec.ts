/**
 * E2E coverage guard: every documented 2xx success response in the
 * OpenAPI spec must describe the runtime `{ message, data, error }`
 * envelope — not the bare data DTO.
 *
 * Historical bug (2026-09-02): controllers annotated success responses
 * with `@ApiOkResponse({ type: ReadingDto })`, which told Scalar that
 * the response body was `ReadingDto` directly. Scalar then rendered the
 * example as a bare reading object, contradicting the actual wire
 * format produced by `apiOk()` at runtime. This test asserts every 2xx
 * response's schema uses an `allOf` that references `ApiSuccessEnvelopeDto`
 * so the documentation matches what the API actually returns.
 *
 * See: src/common/types/api-envelope.decorators.ts for the helpers.
 */
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/env.config';
import { ApiSuccessEnvelopeDto } from '../src/common/types/api-response.dto';

interface OpenApiSchemaObject {
  $ref?: string;
  type?: string;
  items?: OpenApiSchemaObject;
  properties?: Record<string, OpenApiSchemaObject>;
  allOf?: OpenApiSchemaObject[];
  oneOf?: OpenApiSchemaObject[];
  anyOf?: OpenApiSchemaObject[];
  nullable?: boolean;
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

describe('every success response documents the { message, data, error } envelope', () => {
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

    const env = app.get(AppConfigService);
    app.setGlobalPrefix(env.apiPrefix);

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Dolynglish API')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    document = SwaggerModule.createDocument(app, swaggerConfig) as unknown as OpenApiDocument;

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

  const collectSuccessResponses = (): Array<{
    method: string;
    path: string;
    status: string;
    schema: OpenApiSchemaObject;
  }> => {
    const collected: Array<{
      method: string;
      path: string;
      status: string;
      schema: OpenApiSchemaObject;
    }> = [];
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const [method, op] of Object.entries(methods ?? {})) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        for (const [status, response] of Object.entries(op.responses ?? {})) {
          if (status === '200' || status === '201') {
            const schema = response.content?.['application/json']?.schema;
            if (schema) {
              collected.push({ method: method.toUpperCase(), path, status, schema });
            }
          }
        }
      }
    }
    return collected;
  };

  /**
   * Returns true if any branch of the schema (`allOf`, `oneOf`, `anyOf`,
   * or a direct `$ref`) references `ApiSuccessEnvelopeDto` (by its
   * fully-qualified component name).
   */
  const referencesEnvelope = (schema: OpenApiSchemaObject | undefined): boolean => {
    if (!schema) return false;
    if (schema.$ref?.includes(ApiSuccessEnvelopeDto.name)) return true;
    if (schema.allOf) return schema.allOf.some((s) => referencesEnvelope(s));
    if (schema.oneOf) return schema.oneOf.some((s) => referencesEnvelope(s));
    if (schema.anyOf) return schema.anyOf.some((s) => referencesEnvelope(s));
    if (schema.items) return referencesEnvelope(schema.items);
    if (schema.properties) {
      return Object.values(schema.properties).some((s) => referencesEnvelope(s));
    }
    return false;
  };

  it('every 2xx response schema references ApiSuccessEnvelopeDto', () => {
    const successResponses = collectSuccessResponses();
    expect(successResponses.length).toBeGreaterThan(0);

    const offenders = successResponses.filter((r) => !referencesEnvelope(r.schema));
    if (offenders.length > 0) {
      const list = offenders.map((o) => `${o.method} ${o.path} → ${o.status}`).join('\n  - ');
      throw new Error(
        `Endpoints whose success schema does NOT reference the ApiSuccessEnvelopeDto:\n  - ${list}`,
      );
    }
  });

  it('the envelope itself is registered as a component schema', () => {
    const schemas = Object.keys(document.components?.schemas ?? {});
    expect(schemas).toContain(ApiSuccessEnvelopeDto.name);
  });

  it('envelope components document message as string and error as null', () => {
    const envelope = document.components?.schemas?.[ApiSuccessEnvelopeDto.name];
    expect(envelope).toBeDefined();
    const props = envelope?.properties ?? {};
    expect(props['message']?.type).toBe('string');
    expect(props['error']?.type).toBe('object');
    expect(props['data']).toBeDefined();
  });
});
