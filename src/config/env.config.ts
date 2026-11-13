import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvSchema } from './env.validation';

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
    };
    groq: {
      apiKey: string | undefined;
      model: string;
    };
  } {
    return {
      defaultProvider: this.config.get('AI_DEFAULT_PROVIDER', { infer: true }),
      minimax: {
        apiKey: this.config.get('MINIMAX_API_KEY', { infer: true }),
        model: this.config.get('MINIMAX_MODEL', { infer: true }),
        endpoint: this.config.get('MINIMAX_ENDPOINT', { infer: true }),
        timeoutMs: this.config.get('MINIMAX_TIMEOUT_MS', { infer: true }),
        maxTokens: this.config.get('MINIMAX_MAX_TOKENS', { infer: true }),
        temperature: this.config.get('MINIMAX_TEMPERATURE', { infer: true }),
      },
      groq: {
        apiKey: this.config.get('GROQ_API_KEY', { infer: true }),
        model: this.config.get('GROQ_MODEL', { infer: true }),
      },
    };
  }

  // ===== Moderación de categorías =====
  get moderation(): {
    enabled: boolean;
    aiEnabled: boolean;
    scoreThreshold: number;
    timeoutMs: number;
    cacheTtlMs: number;
    openaiApiKey: string | undefined;
    openaiEndpoint: string;
    openaiModel: string;
    perspectiveApiKey: string | undefined;
  } {
    const rawEnabled: unknown = this.config.get('CATEGORY_MODERATION_ENABLED', { infer: true });
    const rawAiEnabled: unknown = this.config.get('CATEGORY_MODERATION_AI_ENABLED', {
      infer: true,
    });
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
    const rawPerspectiveKey: unknown = this.config.get('PERSPECTIVE_API_KEY', { infer: true });

    return {
      enabled: typeof rawEnabled === 'boolean' ? rawEnabled : rawEnabled !== 'false',
      aiEnabled: typeof rawAiEnabled === 'boolean' ? rawAiEnabled : rawAiEnabled !== 'false',
      scoreThreshold:
        typeof rawThreshold === 'number' && !Number.isNaN(rawThreshold) ? rawThreshold : 0.45,
      timeoutMs: typeof rawTimeout === 'number' && rawTimeout > 0 ? rawTimeout : 5000,
      cacheTtlMs: typeof rawCacheTtl === 'number' && rawCacheTtl > 0 ? rawCacheTtl : 86_400_000,
      openaiApiKey:
        typeof rawOpenaiKey === 'string' && rawOpenaiKey.trim().length > 0
          ? rawOpenaiKey.trim()
          : undefined,
      openaiEndpoint:
        typeof rawOpenaiEndpoint === 'string' && rawOpenaiEndpoint.trim().length > 0
          ? rawOpenaiEndpoint.trim()
          : 'https://api.openai.com/v1/moderations',
      openaiModel:
        typeof rawOpenaiModel === 'string' && rawOpenaiModel.trim().length > 0
          ? rawOpenaiModel.trim()
          : 'omni-moderation-latest',
      perspectiveApiKey:
        typeof rawPerspectiveKey === 'string' && rawPerspectiveKey.trim().length > 0
          ? rawPerspectiveKey.trim()
          : undefined,
    };
  }
}
