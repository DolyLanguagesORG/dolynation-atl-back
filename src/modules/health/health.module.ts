import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../../database/database.module';

/**
 * Módulo de monitoreo de salud (`/health`) mediante `@nestjs/terminus`.
 */
@Module({
  imports: [TerminusModule, DatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
