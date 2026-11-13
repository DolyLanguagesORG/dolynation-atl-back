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
import { appVersion } from './common/version';
import { versionHeaderMiddleware } from './common/middleware/version-header.middleware';

/**
 * Punto de entrada de la aplicación NestJS.
 *
 * Configura seguridad (Helmet + CORS + compresión), la cabecera `X-App-Version`,
 * validación global de DTOs, el prefijo global de la API, la documentación
 * OpenAPI/Scalar en `/docs` y la ruta raíz de verificación.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Seguridad y rendimiento. Helmet se configura para permitir la CDN de
  // Scalar API Reference (cdn.jsdelivr.net) de modo que /docs pueda cargar su
  // bundle JS independiente. La ruta /docs se registra antes de setGlobalPrefix
  // para permanecer en la raíz (fuera de /api/v1).
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

  // Cabecera X-App-Version en toda respuesta (incluidos 404 y 401).
  // Va antes del enrutado para que cubra también las peticiones que nunca
  // llegan a un controlador. Ver common/middleware/version-header.middleware.ts.
  app.use(versionHeaderMiddleware);

  // Pipe global de validación — class-validator + class-transformer.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Habilita CORS para los clientes web y móviles.
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Prefijo de la API (configurable vía API_PREFIX; por defecto "api/v1").
  // DEBE ejecutarse ANTES de SwaggerModule.createDocument para que el documento
  // OpenAPI publique las rutas bajo /api/v1/... y el botón "Try it" de Scalar
  // apunte a la ruta real. Mover esto después de createDocument causó en su
  // momento que /docs mostrara POST /auth/register cuando el servidor solo
  // aceptaba POST /api/v1/auth/register.
  const env = app.get(AppConfigService);
  app.setGlobalPrefix(env.apiPrefix);

  // Referencia de API con Scalar en /docs (reemplaza a Swagger UI).
  // IMPORTANTE: se registra aquí pero conservando /docs en la raíz (sin prefijo /api/v1).
  //
  // Nota sobre `.addServer(...)`: NO agregar una URL de servidor que incluya el
  // prefijo de la API. Las rutas del spec ya incluyen el prefijo versionado
  // (porque `setGlobalPrefix` se llamó arriba antes de `createDocument`).
  // Si se añade `/api/v1` como servidor, Scalar lo concatena y produce rutas
  // duplicadas como `/api/v1/api/v1/auth/register` que no existen. Scalar calcula
  // la URL base desde el origen del navegador, por lo que dejar `servers` vacío
  // garantiza que "Try it" use la ruta relativa correcta.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dolynglish API')
    .setDescription(
      'Backend de la aplicación Dolynglish — aprendizaje de idiomas con lecturas y evaluaciones generadas por IA',
    )
    // La versión del documento es la del build en ejecución, no un número
    // fijo: así el OpenAPI reporta la misma versión que /health/live y /health/ready.
    .setVersion(appVersion().version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('auth', 'Registro, inicio y cierre de sesión, renovación de tokens y perfil actual')
    .addTag('user', 'Perfil del usuario y racha de actividad')
    .addTag('subscriptions', 'Planes de suscripción, estado actual y cuotas de uso')
    .addTag('settings', 'Preferencias de categorías e idioma de estudio')
    .addTag('readings', 'Lecturas generadas por IA, evaluaciones de comprensión y vocabulario')
    .addTag('content', 'Generación de lecturas usando preferencias guardadas como respaldo')
    .addTag('evaluation', 'Envío y calificación de resúmenes de lectura')
    .addTag('history', 'Historial agregado de actividad y puntuaciones recientes')
    .addTag('ia', 'Chat directo con el proveedor de inteligencia artificial activo')
    .addTag(
      'admin',
      'Supervisión de categorías globales y listado de usuarios (solo administradores)',
    )
    .addTag('health', 'Sondas de disponibilidad (liveness) y preparación (readiness)')
    .addTag('version', 'Información de la versión y build en ejecución')
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

  // Expone el documento JSON crudo de OpenAPI 3.1 bajo el prefijo versionado
  // para que coincida con las rutas reales. Útil para generar clientes,
  // alimentar agentes de IA o inspeccionar el contrato.
  app.getHttpAdapter().get(`/${env.apiPrefix}/openapi.json`, (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(document);
  });

  // Verificación rápida en la ruta raíz.
  app.getHttpAdapter().get('/', (_req, res) => {
    res.json({
      message: 'Dolynglish API is running',
      // La versión y el commit son los del build en ejecución: los mismos que
      // devuelven /health/live y /health/ready. Antes iban hardcodeados ('1.0.0').
      data: { ...appVersion(), status: 'healthy' },
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
