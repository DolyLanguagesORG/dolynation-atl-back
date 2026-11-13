import { z } from 'zod';

/** Convierte cadenas vacías en `undefined` para aplicar valores por defecto de forma segura. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Esquema centralizado de Zod para todas las variables de entorno.
 * Lo importa AppModule en ConfigModule para validar `process.env` al arrancar.
 * Si falta una variable obligatoria o es inválida, aborta el arranque con el detalle.
 */
const envSchema = z.object({
  // ===== Aplicación =====
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('api/v1'),
  APP_NAME: z.string().default('dolynglish-backend'),
  // La versión ÚNICA de la aplicación: la que compone versions.yml (el
  // manifiesto de qué versión de cada repositorio forma la app publicada).
  // La inyecta el despliegue; sin ella se usa la de este repositorio.
  APP_VERSION: z.string().optional(),
  // Qué pieza de la aplicación es este proceso.
  COMPONENT: z.string().default('dolynation-atl-back'),
  // El momento de la construcción del artefacto. Lo inyecta el build de la
  // imagen; sin ella se usa la hora de arranque del proceso.
  BUILT_AT: z.string().optional(),
  // El commit lo inyecta el Dockerfile en el build (ARG -> ENV).
  GIT_COMMIT: z.string().default('unknown'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // ===== Base de datos =====
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('dolynglish_user'),
  DB_PASSWORD: z.string().default(''),
  DB_DATABASE: z.string().default('dolynglish'),
  DB_LOGGING: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  // ===== Autenticación (JWT) =====
  JWT_SECRET: z.string().min(32).default('change-me-in-production-please-32-chars-minimum'),
  JWT_ACCESS_TTL: z.string().default('5m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // ===== Proveedores de IA =====
  // Solo `minimax` está registrado en la factoría de proveedores
  // (`AIProviderFactory`). Aceptar `groq` aquí pero no ahí hacía que la app
  // arrancara y fallara en tiempo de ejecución al pedir una lectura.
  AI_DEFAULT_PROVIDER: z.enum(['minimax']).default('minimax'),

  // MiniMax M3
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_MODEL: z.string().default('MiniMax-M3'),
  MINIMAX_ENDPOINT: z.string().url().default('https://api.minimax.io/v1/chat/completions'),
  MINIMAX_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  MINIMAX_MAX_TOKENS: z.coerce.number().int().positive().default(8192),
  MINIMAX_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.6),
  MINIMAX_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),

  // Groq (legado — conservado como referencia)
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('qwen/qwen3-32b'),

  // ===== Moderación de categorías dinámicas =====
  CATEGORY_MODERATION_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === undefined || (v.trim().toLowerCase() !== 'false' && v.trim() !== '0')),
  CATEGORY_MODERATION_AI_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === undefined || (v.trim().toLowerCase() !== 'false' && v.trim() !== '0')),
  CATEGORY_MODERATION_AI_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['auto', 'openai', 'minimax', 'none']).default('auto'),
  ),
  CATEGORY_DAILY_LIMIT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(20),
  ),
  CATEGORY_MODERATION_SCORE_THRESHOLD: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0.05).max(1).default(0.45),
  ),
  CATEGORY_MODERATION_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(5000),
  ),
  CATEGORY_MODERATION_CACHE_TTL_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(86_400_000),
  ),

  // OpenAI Moderation API (endpoint gratuito `omni-moderation-latest`; opcional)
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  OPENAI_MODERATION_ENDPOINT: z.preprocess(
    emptyToUndefined,
    z.string().url().default('https://api.openai.com/v1/moderations'),
  ),
  OPENAI_MODERATION_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().default('omni-moderation-latest'),
  ),

  // Google Perspective API (cuota gratuita; opcional)
  PERSPECTIVE_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),

  // ===== Correo transaccional (SMTP) =====
  // Opcionales: sin ellas la app arranca igual y el envío falla con un mensaje
  // claro ("falta SMTP_HOST/SMTP_USER") cuando se intenta enviar un correo.
  // El proveedor es solo configuración: Mailtrap Sandbox en desarrollo y
  // Brevo en staging/producción funcionan con el mismo cliente SMTP.
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(587)),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_FROM_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
  // `true` solo para TLS implícito (puerto 465). Con 587/2525 se usa STARTTLS.
  SMTP_SECURE: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
  ),

  // Base pública del frontend: se usa para construir los enlaces de los correos
  // (confirmación de cuenta y restablecimiento de contraseña).
  FRONTEND_BASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default('http://localhost:3000'),
  ),

  // Cuando es `true`, iniciar sesión (y refrescar el token) exige que el
  // usuario haya confirmado su correo. Desactivado por defecto para no
  // bloquear las cuentas existentes en desarrollo.
  EMAIL_VERIFICATION_REQUIRED: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
  ),
});

export type EnvSchema = z.infer<typeof envSchema>;

/**
 * Valida el objeto crudo de variables de entorno.
 * Devuelve el objeto validado (con conversiones de tipo aplicadas) o lanza un ZodError.
 */
export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  return envSchema.parse(raw);
}
