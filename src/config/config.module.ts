import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/env.config';

/**
 * Módulo global para que AppConfigService pueda inyectarse en cualquier parte sin reimportar.
 * La carga real del entorno la realiza ConfigModule en AppModule; este wrapper solo
 * expone el servicio fuertemente tipado.
 */
@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModuleWrapper {}
