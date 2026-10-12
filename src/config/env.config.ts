import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvSchema } from './env.validation';

/**
 * Strongly-typed wrapper around ConfigService.
 * Use this everywhere instead of raw ConfigService.get() to get type safety.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvSchema, true>) {}

  // ===== App =====
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

  // ===== Database =====
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

  // ===== Auth =====
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

  // ===== AI =====
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
}
