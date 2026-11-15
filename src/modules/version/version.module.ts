import { Module } from '@nestjs/common';
import { VersionController } from './version.controller';

/**
 * Módulo de información de versión de la aplicación (`/version`).
 */
@Module({
  controllers: [VersionController],
})
export class VersionModule {}
