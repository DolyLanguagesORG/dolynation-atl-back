import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

/**
 * Módulo de administración del sistema.
 * Agrupa el controlador, servicio y guardia para operaciones restringidas a administradores.
 */
@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminGuard],
})
export class AdminModule {}
