import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/env.config';

/**
 * Global module so AppConfigService is injectable everywhere without re-importing.
 * The actual env config is loaded by ConfigModule (in AppModule), this just exposes the typed wrapper.
 */
@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModuleWrapper {}
