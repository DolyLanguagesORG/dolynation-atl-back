import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import helmet from 'helmet';
import compression from 'compression';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/env.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Security & perf. Helmet is configured to allow the Scalar API Reference CDN
  // (cdn.jsdelivr.net) so the /docs page can load its standalone JS bundle.
  // The /docs route itself is registered BEFORE setGlobalPrefix below so it stays
  // at the root path (not under /api/v1).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  // Global validation pipe — class-validator + class-transformer
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Enable CORS for the mobile client
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // API prefix (configurable via API_PREFIX, default "api/v1").
  // MUST run BEFORE SwaggerModule.createDocument so the OpenAPI document
  // advertises paths under /api/v1/... and Scalar's "Try it" hits the
  // real route. Moving this after createDocument was the root cause of
  // the production bug where /docs showed POST /auth/register but the
  // live server only accepted POST /api/v1/auth/register.
  const env = app.get(AppConfigService);
  app.setGlobalPrefix(env.apiPrefix);

  // Scalar API reference at /docs (replaces Swagger UI).
  // IMPORTANT: register this BEFORE the OpenAPI document so /docs stays at
  // the root and is NOT prefixed with /api/v1.
  //
  // Note on `.addServer(...)`: DO NOT add a server URL that contains the
  // API prefix. The paths in the spec already carry the versioned prefix
  // (because we called `setGlobalPrefix` above before `createDocument`).
  // If you add a server URL of `/api/v1`, Scalar concatenates it with the
  // paths and produces routes like `/api/v1/api/v1/auth/register`, which
  // the app does not serve. Scalar computes its base URL from the page
  // origin (the actual host:port the browser is on), so leaving servers
  // empty makes the "Try it" button hit the correct relative path.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dolynglish API')
    .setDescription(
      'Backend for the Dolynglish mobile app — language learning with AI-generated reading exercises',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('auth', 'User registration, login, logout, refresh')
    .addTag('user', 'User profile and streak')
    .addTag('readings', 'AI-generated English readings and evaluations')
    .addTag('ia', 'Raw chat with the active AI provider')
    .addTag('health', 'Liveness and readiness probes')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  app.use(
    '/docs',
    apiReference({
      content: document,
      theme: 'purple',
      title: 'Dolynglish API',
    }),
  );

  // Expose the raw OpenAPI 3.1 JSON document at the versioned prefix so
  // it matches the path the app actually serves. Useful for tooling that
  // generates clients, feeds API specs to AI agents, or stores the spec
  // alongside the source code.
  app.getHttpAdapter().get(`/${env.apiPrefix}/openapi.json`, (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(document);
  });

  // Root health-check
  app.getHttpAdapter().get('/', (_req, res) => {
    res.json({
      message: 'Dolynglish API is running',
      data: { version: '1.0.0', status: 'healthy' },
    });
  });

  await app.listen(env.port, env.host);
  const url = await app.getUrl();
  app.get(Logger).log(`Application listening on ${url}`);
  app.get(Logger).log(`API documentation: ${url}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
