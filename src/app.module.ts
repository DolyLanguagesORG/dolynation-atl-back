import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type EnvSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ReadingsModule } from './modules/readings/readings.module';
import { ContentModule } from './modules/content/content.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import { HistoryModule } from './modules/history/history.module';
import { AdminModule } from './modules/admin/admin.module';
import { IaModule } from './modules/ia/ia.module';
import { HealthModule } from './modules/health/health.module';
import { VersionModule } from './modules/version/version.module';

/**
 * Módulo raíz de la aplicación.
 *
 * Registra la configuración global validada con Zod, el logger estructurado
 * con Pino (ocultando cabeceras y campos sensibles), la infraestructura común
 * y de base de datos, y todos los módulos de dominio de Dolynglish.
 */
@Module({
  imports: [
    // Carga y valida variables de entorno al arranque; falla rápido si falta alguna clave crítica.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => validateEnv(raw) as Record<string, unknown>,
    }),

    // Logger HTTP estructurado. En desarrollo formatea con pino-pretty; en producción emite JSON limpio.
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
    SubscriptionsModule,
    SettingsModule,
    ReadingsModule,
    ContentModule,
    EvaluationModule,
    HistoryModule,
    AdminModule,
    IaModule,
    HealthModule,
    VersionModule,
  ],
})
export class AppModule {}

export type { EnvSchema };
