import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ReadingsModule } from '../readings/readings.module';

@Module({
  imports: [ReadingsModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
