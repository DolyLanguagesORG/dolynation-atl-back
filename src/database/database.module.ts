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
      useFactory: async (config: AppConfigService): Promise<ReturnType<typeof drizzle>> => {
        const dbCfg = config.db;
        const pool = new Pool({
          host: dbCfg.host,
          port: dbCfg.port,
          user: dbCfg.user,
          password: dbCfg.password,
          database: dbCfg.database,
          max: 10,
        });
        const orm = drizzle(pool);
        const logger = new Logger('DatabaseModule');
        try {
          await pool.query('SELECT 1');
          logger.log(`Connected to PostgreSQL at ${dbCfg.host}:${dbCfg.port}/${dbCfg.database}`);
        } catch (err) {
          logger.error(`Database smoke test FAILED: ${(err as Error).message}`);
          throw err;
        }
        return orm;
      },
      inject: [AppConfigService],
    },
  ],
  exports: [DRIZZLE, AppConfigService],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DRIZZLE) private readonly db: ReturnType<typeof drizzle>) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Database module ready');
    await Promise.resolve();
  }

  async onApplicationShutdown(): Promise<void> {
    const pool = (this.db as unknown as { $client?: Pool }).$client;
    if (pool && typeof pool.end === 'function') {
      await pool.end();
      this.logger.log('Database pool closed');
    }
  }
}
