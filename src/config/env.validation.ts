import { z } from 'zod';

/**
 * Centralised Zod schema for all environment variables.
 * Imported by ConfigModule and used to validate process.env at boot.
 * Failures abort the boot with a clear list of missing/invalid vars.
 */
const envSchema = z.object({
  // ===== App =====
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('api/v1'),
  APP_NAME: z.string().default('dolynglish-backend'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // ===== Database =====
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('dolynglish_user'),
  DB_PASSWORD: z.string().default(''),
  DB_DATABASE: z.string().default('dolynglish'),
  DB_LOGGING: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  // ===== Auth (JWT) =====
  JWT_SECRET: z.string().min(32).default('change-me-in-production-please-32-chars-minimum'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // ===== AI providers =====
  AI_DEFAULT_PROVIDER: z.enum(['minimax', 'groq']).default('minimax'),

  // MiniMax M3
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_MODEL: z.string().default('MiniMax-M3'),
  MINIMAX_ENDPOINT: z.string().url().default('https://api.minimax.io/v1/chat/completions'),
  MINIMAX_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MINIMAX_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  MINIMAX_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.6),

  // Groq (legacy — kept for reference)
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('qwen/qwen3-32b'),
});

export type EnvSchema = z.infer<typeof envSchema>;

/**
 * Validate raw env object. Returns the parsed (and coerced) object on success.
 * Throws a ZodError with detailed messages on failure.
 */
export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  return envSchema.parse(raw);
}
