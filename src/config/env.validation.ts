import { z } from 'zod';

/** Convierte cadenas vacías en `undefined` para aplicar valores por defecto de forma segura. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Esquema centralizado de Zod para todas las variables de entorno.
 * Lo importa AppModule en ConfigModule para validar `process.env` al arrancar.
 * Si falta una variable obligatoria o es inválida, aborta el arranque con el detalle.
 */
const baseEnvSchema = z.object({
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
  // `emptyToUndefined` importa: una variable de GitHub que no existe llega
  // como cadena vacia, y sin esto `AI_DEFAULT_PROVIDER=` haria fallar el enum
  // en el arranque (y `JWT_ACCESS_TTL=` dejaria los tokens sin expirar).
  JWT_ACCESS_TTL: z.preprocess(emptyToUndefined, z.string().default('5m')),
  JWT_REFRESH_TTL: z.preprocess(emptyToUndefined, z.string().default('30d')),

  // ===== Proveedores de IA =====
  // Proveedores registrados en `AIProviderFactory`: `minimax` y `google`.
  // `groq` se conserva solo como configuración legada sin proveedor activo en la factoría.
  AI_DEFAULT_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['minimax', 'google']).default('minimax'),
  ),

  // MiniMax
  MINIMAX_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  // `emptyToUndefined` en todas: una variable o secret de GitHub que no
  // existe llega como cadena vacia. Sin el preprocess, `MINIMAX_MODEL=`
  // mandaria un modelo inexistente al API y `MINIMAX_REASONING_EFFORT=`
  // reventaria el enum en el arranque.
  MINIMAX_MODEL: z.preprocess(emptyToUndefined, z.string().default('MiniMax-M2.7')),
  MINIMAX_ENDPOINT: z.preprocess(
    emptyToUndefined,
    z.string().url().default('https://api.minimax.io/v1/chat/completions'),
  ),
  MINIMAX_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  MINIMAX_MAX_TOKENS: z.coerce.number().int().positive().default(8192),
  MINIMAX_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  MINIMAX_REASONING_EFFORT: z.preprocess(
    emptyToUndefined,
    z.enum(['minimal', 'low', 'medium', 'high']).default('low'),
  ),

  // Google AI Studio (Gemini — compatible con Chat Completions de OpenAI)
  GOOGLE_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_MODEL: z.preprocess(emptyToUndefined, z.string().default('gemini-3.5-flash-lite')),
  GOOGLE_ENDPOINT: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .url()
      .default('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'),
  ),
  GOOGLE_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(90000),
  ),
  GOOGLE_MAX_TOKENS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(8192),
  ),
  GOOGLE_TEMPERATURE: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(2).default(0.7)),
  // Google Decisions API (`gemini-decision-1`, 0 tokens de salida para compuertas condicionales)
  GOOGLE_DECISIONS_MODEL: z.preprocess(emptyToUndefined, z.string().default('gemini-decision-1')),
  GOOGLE_DECISIONS_ENDPOINT: z.preprocess(
    emptyToUndefined,
    z.string().url().default('https://generativelanguage.googleapis.com/v1beta/decisions'),
  ),
  GOOGLE_DECISIONS_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(15000),
  ),

  // Groq (legado — conservado como referencia)
  GROQ_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GROQ_MODEL: z.preprocess(emptyToUndefined, z.string().default('qwen/qwen3-32b')),

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
    z.enum(['auto', 'openai', 'google-decisions', 'minimax', 'google', 'none']).default('auto'),
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
    z.coerce.number().int().positive().default(15000),
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

  // ===== Solicitudes de acceso y aprobación administrativa =====
  // Cuando es `true`, elegir plan o desbloquear un idioma entra a lista de espera
  // hasta que un administrador apruebe la solicitud. Cuando es `false`, opera
  // la activación directa heredada y las solicitudes manuales quedan deshabilitadas.
  ACCESS_REQUESTS_ENABLED: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
  ),

  // Correo opcional para notificar al equipo/administrador cuando entra una nueva solicitud.
  ADMIN_NOTIFICATION_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),

  // ===== Pasarela de pagos (Stripe Sandbox / manual) =====
  BILLING_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['manual', 'stripe']).default('manual')),
  // El tag entra en la clave de idempotencia de Stripe, que tiene un tope
  // de 255 caracteres: un tag sin limite lo desbordaria.
  BILLING_ENV_TAG: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(1)
      .max(32)
      .regex(
        /^[A-Za-z0-9._-]+$/,
        'BILLING_ENV_TAG solo admite letras, digitos, punto, guion y guion bajo',
      )
      .default('local'),
  ),
  // El formato se valida aqui y no en el arranque de Stripe: una clave mal
  // pegada (con espacios o truncada) fallaba en runtime, en el checkout,
  // con un error de la pasarela que no dice nada util.
  STRIPE_SECRET_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9_]+$/, 'STRIPE_SECRET_KEY tiene un formato invalido')
      .optional(),
  ),
  STRIPE_PUBLISHABLE_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^pk_(test|live)_[A-Za-z0-9_]+$/, 'STRIPE_PUBLISHABLE_KEY tiene un formato invalido')
      .optional(),
  ),
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^whsec_[A-Za-z0-9_]+$/, 'STRIPE_WEBHOOK_SECRET tiene un formato invalido')
      .optional(),
  ),
  STRIPE_CURRENCY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .default('mxn')
      .transform((v) => v.trim().toLowerCase()),
  ),
  STRIPE_CHECKOUT_UI_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(['custom', 'hosted']).default('custom'),
  ),
  STRIPE_PRICE_DOLLY: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_DOLLY_PLUS: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_DOLLY_PRO: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_LANGUAGE_UNLOCK: z.preprocess(emptyToUndefined, z.string().optional()),

  // ===== Autenticación externa OAuth 2.0 / OIDC =====
  // Opcionales: si las credenciales de un proveedor faltan, queda deshabilitado sin impedir el arranque.
  GOOGLE_OAUTH_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_OAUTH_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_OAUTH_REDIRECT_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),
  MICROSOFT_OAUTH_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  MICROSOFT_OAUTH_TENANT: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform((value) => value.toLowerCase())
      .refine(
        (value) =>
          /^(common|organizations|consumers|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
            value,
          ),
        {
          message:
            'MICROSOFT_OAUTH_TENANT debe ser "common", "organizations", "consumers" o un UUID válido de tenant',
        },
      )
      .default('common'),
  ),
  MICROSOFT_OAUTH_REDIRECT_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),

  // ===== Seguridad anti-bot (Cloudflare Turnstile) y red =====
  CAPTCHA_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['disabled', 'turnstile']).default('disabled'),
  ),
  CAPTCHA_SITE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CAPTCHA_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CAPTCHA_APPEARANCE: z.preprocess(
    emptyToUndefined,
    z.enum(['interaction-only', 'always', 'execute']).default('interaction-only'),
  ),
  CAPTCHA_ALLOWED_HOSTNAMES: z.preprocess(emptyToUndefined, z.string().optional()),
  CAPTCHA_VERIFY_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default('https://challenges.cloudflare.com/turnstile/v0/siteverify'),
  ),
  CAPTCHA_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(5000),
  ),
  CAPTCHA_FAIL_OPEN: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
  ),
  IP_RATE_LIMIT_ENABLED: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .optional()
      .transform((v) =>
        v === undefined ? undefined : v.trim().toLowerCase() !== 'false' && v.trim() !== '0',
      ),
  ),
  CORS_ALLOWED_ORIGINS: z.preprocess(emptyToUndefined, z.string().optional()),
});

/**
 * El provider de Google lanza `GOOGLE_API_KEY is not configured` en runtime.
 * Sin esta regla, la app arrancaba igual y **cada** generacion de lectura
 * fallaba en silencio (el `AiDegradedService` la atrapaba y degradaba).
 * Con la regla, la app no arranca y el error dice exactamente que falta.
 *
 * Del mismo modo, cuando `BILLING_PROVIDER=stripe`, el arranque exige las claves
 * e IDs de precio mínimos del Sandbox/entorno para no fallar más tarde en checkout.
 */
const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.AI_DEFAULT_PROVIDER === 'google' && !env.GOOGLE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GOOGLE_API_KEY'],
      message:
        'GOOGLE_API_KEY es obligatoria cuando AI_DEFAULT_PROVIDER=google: sin ella el proveedor lanza "GOOGLE_API_KEY is not configured" en cada generacion de lectura',
    });
  }

  if (env.BILLING_PROVIDER === 'stripe') {
    const requiredWhenStripe = [
      'STRIPE_SECRET_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_DOLLY_PLUS',
      'STRIPE_PRICE_DOLLY_PRO',
      'STRIPE_PRICE_LANGUAGE_UNLOCK',
    ] as const;

    for (const key of requiredWhenStripe) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} es obligatoria cuando BILLING_PROVIDER=stripe`,
        });
      }
    }
  }

  for (const prefix of ['GOOGLE_OAUTH', 'MICROSOFT_OAUTH'] as const) {
    const clientIdKey = `${prefix}_CLIENT_ID` as const;
    const clientSecretKey = `${prefix}_CLIENT_SECRET` as const;

    if (env[clientIdKey] && !env[clientSecretKey]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [clientSecretKey],
        message: `${clientSecretKey} es obligatoria cuando ${clientIdKey} está definida`,
      });
    }

    if (env[clientSecretKey] && !env[clientIdKey]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [clientIdKey],
        message: `${clientIdKey} es obligatoria cuando ${clientSecretKey} está definida`,
      });
    }
  }

  if (env.CAPTCHA_PROVIDER === 'turnstile') {
    if (!env.CAPTCHA_SITE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CAPTCHA_SITE_KEY'],
        message: 'CAPTCHA_SITE_KEY es obligatoria cuando CAPTCHA_PROVIDER=turnstile',
      });
    }
    if (!env.CAPTCHA_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CAPTCHA_SECRET_KEY'],
        message: 'CAPTCHA_SECRET_KEY es obligatoria cuando CAPTCHA_PROVIDER=turnstile',
      });
    }
  }
});

export type EnvSchema = z.infer<typeof envSchema>;

/**
 * Valida el objeto crudo de variables de entorno.
 * Devuelve el objeto validado (con conversiones de tipo aplicadas) o lanza un ZodError.
 */
export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  return envSchema.parse(raw);
}
