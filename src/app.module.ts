import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type EnvSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ReadingsModule } from './modules/readings/readings.module';
import { IaModule } from './modules/ia/ia.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => validateEnv(raw) as Record<string, unknown>,
    }),

    LoggerModule.forRootAsync({
      useFactory: () => {
        const transport =
          process.env['NODE_ENV'] === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { colorize: true, singleLine: true } };
        const redact = {
          paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
          censor: '[REDACTED]',
        };
        return transport === undefined
          ? { pinoHttp: { level: process.env['LOG_LEVEL'] ?? 'info', redact } }
          : { pinoHttp: { level: process.env['LOG_LEVEL'] ?? 'info', transport, redact } };
      },
    }),

    CommonModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    ReadingsModule,
    IaModule,
    HealthModule,
  ],
})
export class AppModule {}

export type { EnvSchema };
