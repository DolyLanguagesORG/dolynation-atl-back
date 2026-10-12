import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

describe('OpenAPI schema documentation', () => {
  let app: INestApplication;
  let document: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('ConfigService')
      .useValue({
        get: (key: string): string => {
          const map: Record<string, string> = {
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
          return map[key] ?? '';
        },
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    const config = new DocumentBuilder()
      .setTitle('Dolynglish API')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    document = SwaggerModule.createDocument(app, config);
  });

  afterAll(async () => {
    await app.close();
  });

  const schemas = (): Record<string, Record<string, unknown>> =>
    (document.components?.schemas ?? {}) as Record<string, Record<string, unknown>>;

  describe('auth DTOs', () => {
    it('documents RegisterDto with email, password, fullName', () => {
      const schema = schemas()['RegisterDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['email']).toBeDefined();
      expect(props['password']).toBeDefined();
      expect(props['fullName']).toBeDefined();
    });

    it('documents LoginDto with email, password', () => {
      const schema = schemas()['LoginDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['email']).toBeDefined();
      expect(props['password']).toBeDefined();
    });

    it('documents RefreshTokenDto with refreshToken', () => {
      const schema = schemas()['RefreshTokenDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['refreshToken']).toBeDefined();
    });
  });

  describe('readings DTOs', () => {
    it('documents GenerateReadingDto with category (required), difficulty, and size', () => {
      const schema = schemas()['GenerateReadingDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['category']).toBeDefined();
      expect(props['difficulty']).toBeDefined();
      expect(props['size']).toBeDefined();
      // The previous version of this DTO had a `seed` field that was a
      // no-op; this regression test pins its removal.
      expect(props['seed']).toBeUndefined();
      // And a `cefrLevel` field that the service now derives internally —
      // it must NOT leak into the public spec, only `category`+`difficulty`+`size`.
      expect(props['cefrLevel']).toBeUndefined();
    });

    it('documents EvaluateReadingDto with userResponse', () => {
      const schema = schemas()['EvaluateReadingDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['userResponse']).toBeDefined();
    });

    it('documents CreateExplanationDto with word and context', () => {
      const schema = schemas()['CreateExplanationDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['word']).toBeDefined();
      expect(props['context']).toBeDefined();
    });
  });

  describe('ia DTOs', () => {
    it('documents ChatRequestDto with messages and optional systemPrompt', () => {
      const schema = schemas()['ChatRequestDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['messages']).toBeDefined();
      expect(props['systemPrompt']).toBeDefined();
    });

    it('documents ChatMessageDto with role and content', () => {
      const schema = schemas()['ChatMessageDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['role']).toBeDefined();
      expect(props['content']).toBeDefined();
    });
  });

  describe('users DTOs', () => {
    it('documents StreakQueryDto with days', () => {
      const schema = schemas()['StreakQueryDto'];
      expect(schema).toBeDefined();
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      expect(props['days']).toBeDefined();
    });
  });

  describe('endpoints expose their request body schemas', () => {
    const requiresBodySchema = (
      method: 'post' | 'patch' | 'put',
      path: string,
      schemaName: string,
    ): void => {
      const op = document.paths?.[path]?.[method] as Record<string, unknown> | undefined;
      expect(op).toBeDefined();
      const requestBody = op?.['requestBody'] as Record<string, unknown> | undefined;
      expect(requestBody).toBeDefined();
      const content = requestBody?.['content'] as
        Record<string, Record<string, { schema?: { $ref?: string } }>> | undefined;
      const jsonContent = content?.['application/json'];
      expect(jsonContent).toBeDefined();
      const ref = (jsonContent?.['schema'] as { $ref?: string } | undefined)?.['$ref'];
      expect(ref).toBeDefined();
      expect(ref).toContain(schemaName);
    };

    it('POST /auth/register references RegisterDto', () => {
      requiresBodySchema('post', '/api/v1/auth/register', 'RegisterDto');
    });

    it('POST /auth/login references LoginDto', () => {
      requiresBodySchema('post', '/api/v1/auth/login', 'LoginDto');
    });

    it('POST /readings references GenerateReadingDto', () => {
      requiresBodySchema('post', '/api/v1/readings', 'GenerateReadingDto');
    });

    it('POST /readings/{id}/evaluate references EvaluateReadingDto', () => {
      requiresBodySchema('post', '/api/v1/readings/{id}/evaluate', 'EvaluateReadingDto');
    });

    it('POST /readings/{id}/explanations references CreateExplanationDto', () => {
      requiresBodySchema('post', '/api/v1/readings/{id}/explanations', 'CreateExplanationDto');
    });

    it('POST /ia/chat references ChatRequestDto', () => {
      requiresBodySchema('post', '/api/v1/ia/chat', 'ChatRequestDto');
    });
  });
});
