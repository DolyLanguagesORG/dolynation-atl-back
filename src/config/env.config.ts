import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvSchema } from './env.validation';

const DEFAULT_GOOGLE_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_GOOGLE_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const DEFAULT_GOOGLE_DECISIONS_MODEL = 'gemini-decision-1';
const DEFAULT_GOOGLE_DECISIONS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/decisions';

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return optionalTrimmedString(value) ?? fallback;
}

function positiveInt(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

function validFloat(value: unknown, fallback: number): number {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && !Number.isNaN(num) ? num : fallback;
}

/**
 * Wrapper fuertemente tipado sobre ConfigService.
 * Úsalo en toda la aplicación en lugar de llamar a ConfigService.get() sin tipado.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvSchema, true>) {}

  // ===== Aplicación =====
  get nodeEnv(): EnvSchema['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }
  get port(): number {
    return this.config.get('PORT', { infer: true });
  }
  get host(): string {
    return this.config.get('HOST', { infer: true });
  }
  get apiPrefix(): string {
    return this.config.get('API_PREFIX', { infer: true });
  }
  get appName(): string {
    return this.config.get('APP_NAME', { infer: true });
  }
  get logLevel(): EnvSchema['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  // ===== Base de datos =====
  get db(): {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    logging: boolean;
  } {
    return {
      host: this.config.get('DB_HOST', { infer: true }),
      port: this.config.get('DB_PORT', { infer: true }),
      user: this.config.get('DB_USER', { infer: true }),
      password: this.config.get('DB_PASSWORD', { infer: true }),
      database: this.config.get('DB_DATABASE', { infer: true }),
      logging: this.config.get('DB_LOGGING', { infer: true }),
    };
  }

  // ===== Autenticación =====
  get jwt(): {
    secret: string;
    accessTtl: string;
    refreshTtl: string;
  } {
    return {
      secret: this.config.get('JWT_SECRET', { infer: true }),
      accessTtl: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      refreshTtl: this.config.get('JWT_REFRESH_TTL', { infer: true }),
    };
  }

  // ===== Autenticación externa OAuth 2.0 / OIDC =====
  get oauth(): {
    google: {
      enabled: boolean;
      clientId: string | undefined;
      clientSecret: string | undefined;
      redirectUri: string;
    };
  } {
    const clientId = optionalTrimmedString(
      this.config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true }),
    );
    const clientSecret = optionalTrimmedString(
      this.config.get('GOOGLE_OAUTH_CLIENT_SECRET', { infer: true }),
    );
    const frontendBaseUrl = nonEmptyString(
      this.config.get('FRONTEND_BASE_URL', { infer: true }),
      'http://localhost:3000',
    ).replace(/\/+$/, '');
    const explicitRedirectUri = optionalTrimmedString(
      this.config.get('GOOGLE_OAUTH_REDIRECT_URI', { infer: true }),
    );

    return {
      google: {
        enabled: Boolean(clientId && clientSecret),
        clientId,
        clientSecret,
        redirectUri: explicitRedirectUri ?? `${frontendBaseUrl}/api/auth/oauth/google/callback`,
      },
    };
  }

  // ===== Inteligencia Artificial =====
  get ai(): {
    defaultProvider: EnvSchema['AI_DEFAULT_PROVIDER'];
    minimax: {
      apiKey: string | undefined;
      model: string;
      endpoint: string;
      timeoutMs: number;
      maxTokens: number;
      temperature: number;
      reasoningEffort: EnvSchema['MINIMAX_REASONING_EFFORT'];
    };
    google: {
      apiKey: string | undefined;
      model: string;
      endpoint: string;
      timeoutMs: number;
      maxTokens: number;
      temperature: number;
      decisions: {
        model: string;
        endpoint: string;
        timeoutMs: number;
      };
    };
    groq: {
      apiKey: string | undefined;
      model: string;
    };
  } {
    const rawProvider: unknown = this.config.get('AI_DEFAULT_PROVIDER', { infer: true });
    const normalizedProvider =
      typeof rawProvider === 'string' ? rawProvider.trim().toLowerCase() : '';
    const defaultProvider: EnvSchema['AI_DEFAULT_PROVIDER'] =
      normalizedProvider === 'google' || normalizedProvider === 'minimax'
        ? normalizedProvider
        : 'minimax';

    return {
      defaultProvider,
      minimax: {
        apiKey: optionalTrimmedString(this.config.get('MINIMAX_API_KEY', { infer: true })),
        model: this.config.get('MINIMAX_MODEL', { infer: true }),
        endpoint: this.config.get('MINIMAX_ENDPOINT', { infer: true }),
        timeoutMs: this.config.get('MINIMAX_TIMEOUT_MS', { infer: true }),
        maxTokens: this.config.get('MINIMAX_MAX_TOKENS', { infer: true }),
        temperature: this.config.get('MINIMAX_TEMPERATURE', { infer: true }),
        reasoningEffort: this.config.get('MINIMAX_REASONING_EFFORT', { infer: true }),
      },
      google: {
        apiKey: optionalTrimmedString(this.config.get('GOOGLE_API_KEY', { infer: true })),
        model: nonEmptyString(
          this.config.get('GOOGLE_MODEL', { infer: true }),
          DEFAULT_GOOGLE_MODEL,
        ),
        endpoint: nonEmptyString(
          this.config.get('GOOGLE_ENDPOINT', { infer: true }),
          DEFAULT_GOOGLE_ENDPOINT,
        ),
        timeoutMs: positiveInt(this.config.get('GOOGLE_TIMEOUT_MS', { infer: true }), 90_000),
        maxTokens: positiveInt(this.config.get('GOOGLE_MAX_TOKENS', { infer: true }), 8192),
        temperature: validFloat(this.config.get('GOOGLE_TEMPERATURE', { infer: true }), 0.7),
        decisions: {
          model: nonEmptyString(
            this.config.get('GOOGLE_DECISIONS_MODEL', { infer: true }),
            DEFAULT_GOOGLE_DECISIONS_MODEL,
          ),
          endpoint: nonEmptyString(
            this.config.get('GOOGLE_DECISIONS_ENDPOINT', { infer: true }),
            DEFAULT_GOOGLE_DECISIONS_ENDPOINT,
          ),
          timeoutMs: positiveInt(
            this.config.get('GOOGLE_DECISIONS_TIMEOUT_MS', { infer: true }),
            15_000,
          ),
        },
      },
      groq: {
        apiKey: this.config.get('GROQ_API_KEY', { infer: true }),
        model: this.config.get('GROQ_MODEL', { infer: true }),
      },
    };
  }

  // ===== Correo transaccional =====
  get mail(): {
    host: string | undefined;
    port: number;
    user: string | undefined;
    password: string | undefined;
    from: string | undefined;
    fromName: string | undefined;
    secure: boolean;
    frontendBaseUrl: string;
    verificationRequired: boolean;
  } {
    return {
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      user: this.config.get('SMTP_USER', { infer: true }),
      password: this.config.get('SMTP_PASSWORD', { infer: true }),
      from: this.config.get('SMTP_FROM', { infer: true }),
      fromName: this.config.get('SMTP_FROM_NAME', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      frontendBaseUrl: this.config.get('FRONTEND_BASE_URL', { infer: true }),
      verificationRequired: this.config.get('EMAIL_VERIFICATION_REQUIRED', { infer: true }),
    };
  }

  // ===== Solicitudes de acceso y aprobación administrativa =====
  get accessRequests(): {
    enabled: boolean;
    adminNotificationEmail: string | undefined;
  } {
    return {
      enabled: this.config.get('ACCESS_REQUESTS_ENABLED', { infer: true }),
      adminNotificationEmail: optionalTrimmedString(
        this.config.get('ADMIN_NOTIFICATION_EMAIL', { infer: true }),
      ),
    };
  }

  // ===== Pasarela de pagos (Stripe Sandbox / manual) =====
  get billing(): {
    provider: 'manual' | 'stripe';
    envTag: string;
    currency: string;
    checkoutUiMode: 'custom' | 'hosted';
    stripe: {
      secretKey: string | undefined;
      publishableKey: string | undefined;
      webhookSecret: string | undefined;
      prices: {
        dolly: string | undefined;
        dollyPlus: string | undefined;
        dollyPro: string | undefined;
        languageUnlock: string | undefined;
      };
    };
  } {
    const rawProvider: unknown = this.config.get('BILLING_PROVIDER', { infer: true });
    const rawUiMode: unknown = this.config.get('STRIPE_CHECKOUT_UI_MODE', { infer: true });
    const rawCurrency: unknown = this.config.get('STRIPE_CURRENCY', { infer: true });

    const provider = rawProvider === 'stripe' ? 'stripe' : 'manual';
    const checkoutUiMode = rawUiMode === 'hosted' ? 'hosted' : 'custom';

    return {
      provider,
      envTag: nonEmptyString(this.config.get('BILLING_ENV_TAG', { infer: true }), 'local'),
      currency: nonEmptyString(rawCurrency, 'mxn').toLowerCase(),
      checkoutUiMode,
      stripe: {
        secretKey: optionalTrimmedString(this.config.get('STRIPE_SECRET_KEY', { infer: true })),
        publishableKey: optionalTrimmedString(
          this.config.get('STRIPE_PUBLISHABLE_KEY', { infer: true }),
        ),
        webhookSecret: optionalTrimmedString(
          this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true }),
        ),
        prices: {
          dolly: optionalTrimmedString(this.config.get('STRIPE_PRICE_DOLLY', { infer: true })),
          dollyPlus: optionalTrimmedString(
            this.config.get('STRIPE_PRICE_DOLLY_PLUS', { infer: true }),
          ),
          dollyPro: optionalTrimmedString(
            this.config.get('STRIPE_PRICE_DOLLY_PRO', { infer: true }),
          ),
          languageUnlock: optionalTrimmedString(
            this.config.get('STRIPE_PRICE_LANGUAGE_UNLOCK', { infer: true }),
          ),
        },
      },
    };
  }

  // ===== Moderación de categorías =====
  get moderation(): {
    enabled: boolean;
    aiEnabled: boolean;
    aiProvider: 'auto' | 'openai' | 'google-decisions' | 'minimax' | 'google' | 'none';
    dailyCategoryLimit: number;
    scoreThreshold: number;
    timeoutMs: number;
    cacheTtlMs: number;
    openaiApiKey: string | undefined;
    openaiEndpoint: string;
    openaiModel: string;
  } {
    const rawEnabled: unknown = this.config.get('CATEGORY_MODERATION_ENABLED', { infer: true });
    const rawAiEnabled: unknown = this.config.get('CATEGORY_MODERATION_AI_ENABLED', {
      infer: true,
    });
    const rawAiProvider: unknown = this.config.get('CATEGORY_MODERATION_AI_PROVIDER', {
      infer: true,
    });
    const rawDailyLimit: unknown = this.config.get('CATEGORY_DAILY_LIMIT', { infer: true });
    const rawThreshold: unknown = this.config.get('CATEGORY_MODERATION_SCORE_THRESHOLD', {
      infer: true,
    });
    const rawTimeout: unknown = this.config.get('CATEGORY_MODERATION_TIMEOUT_MS', { infer: true });
    const rawCacheTtl: unknown = this.config.get('CATEGORY_MODERATION_CACHE_TTL_MS', {
      infer: true,
    });
    const rawOpenaiKey: unknown = this.config.get('OPENAI_API_KEY', { infer: true });
    const rawOpenaiEndpoint: unknown = this.config.get('OPENAI_MODERATION_ENDPOINT', {
      infer: true,
    });
    const rawOpenaiModel: unknown = this.config.get('OPENAI_MODERATION_MODEL', { infer: true });

    const normalizedProvider =
      typeof rawAiProvider === 'string' ? rawAiProvider.trim().toLowerCase() : '';
    const aiProvider: 'auto' | 'openai' | 'google-decisions' | 'minimax' | 'google' | 'none' =
      normalizedProvider === 'openai' ||
      normalizedProvider === 'google-decisions' ||
      normalizedProvider === 'minimax' ||
      normalizedProvider === 'google' ||
      normalizedProvider === 'none' ||
      normalizedProvider === 'auto'
        ? normalizedProvider
        : 'auto';

    return {
      enabled: typeof rawEnabled === 'boolean' ? rawEnabled : rawEnabled !== 'false',
      aiEnabled: typeof rawAiEnabled === 'boolean' ? rawAiEnabled : rawAiEnabled !== 'false',
      aiProvider,
      dailyCategoryLimit: positiveInt(rawDailyLimit, 20),
      scoreThreshold: validFloat(rawThreshold, 0.45),
      timeoutMs: positiveInt(rawTimeout, 5000),
      cacheTtlMs: positiveInt(rawCacheTtl, 86_400_000),
      openaiApiKey: optionalTrimmedString(rawOpenaiKey),
      openaiEndpoint: nonEmptyString(rawOpenaiEndpoint, 'https://api.openai.com/v1/moderations'),
      openaiModel: nonEmptyString(rawOpenaiModel, 'omni-moderation-latest'),
    };
  }
}
