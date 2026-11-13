import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ReadingsModule } from '../readings/readings.module';
import { SettingsModule } from '../settings/settings.module';

/**
 * Módulo de generación de contenido educativo.
 * Reutiliza `ReadingsModule` y `SettingsModule` para resolver preferencias y persistir lecturas.
 */
@Module({
  imports: [ReadingsModule, SettingsModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
