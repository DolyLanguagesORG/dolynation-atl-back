import { z } from 'zod';

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
  MINIMAX_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MINIMAX_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  MINIMAX_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.6),

  // Groq (legado — conservado como referencia)
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('qwen/qwen3-32b'),
});

export type EnvSchema = z.infer<typeof envSchema>;

/**
 * Valida el objeto crudo de variables de entorno.
 * Devuelve el objeto validado (con conversiones de tipo aplicadas) o lanza un ZodError.
 */
export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  return envSchema.parse(raw);
}
