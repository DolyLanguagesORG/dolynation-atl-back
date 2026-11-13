import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ReadingsModule } from '../readings/readings.module';

/**
 * Módulo de generación de contenido educativo.
 * Reutiliza `ReadingsModule` para delegar la creación y persistencia de lecturas.
 */
@Module({
  imports: [ReadingsModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
