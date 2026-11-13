import {
  Module,
  Global,
  Inject,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfigService } from '../config/env.config';
import { DRIZZLE } from './database.tokens';
import type { drizzle as drizzleType } from 'drizzle-orm/node-postgres';

export type DrizzleDb = ReturnType<typeof drizzleType>;

/**
 * Módulo global de base de datos.
 *
 * Configura el pool de PostgreSQL (`pg`) y expone el cliente Drizzle ORM
 * mediante el token `DRIZZLE`, además de cerrar el pool ordenadamente al apagar.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AppConfigService,
      useFactory: (config: ConfigService): AppConfigService =>
        new AppConfigService(config as never),
      inject: [ConfigService],
    },
    {
      provide: DRIZZLE,
      useFactory: (config: AppConfigService): ReturnType<typeof drizzle> => {
        const dbCfg = config.db;
        const pool = new Pool({
          host: dbCfg.host,
          port: dbCfg.port,
          user: dbCfg.user,
          password: dbCfg.password,
          database: dbCfg.database,
          max: 10,
        });
        return drizzle(pool);
      },
      inject: [AppConfigService],
    },
  ],
  exports: [DRIZZLE, AppConfigService],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DRIZZLE) private readonly db: ReturnType<typeof drizzle>) {}

  /** Registra en el log que el pool de conexiones quedó configurado al iniciar el módulo. */
  onModuleInit(): void {
    this.logger.log('Database pool configured');
  }

  /** Cierra el pool de conexiones PostgreSQL durante el apagado de la aplicación. */
  async onApplicationShutdown(): Promise<void> {
    const pool = (this.db as unknown as { $client?: Pool }).$client;
    if (pool && typeof pool.end === 'function') {
      await pool.end();
      this.logger.log('Database pool closed');
    }
  }
}
