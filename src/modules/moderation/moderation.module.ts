import { Module } from '@nestjs/common';
import { IaModule } from '../ia/ia.module';
import { CategoryAiModeratorService } from './category-ai-moderator.service';
import { CategoryModerationService } from './category-moderation.service';

/**
 * Módulo de moderación de contenido para categorías dinámicas.
 * Reúne normalización, blacklist, expresiones regulares y moderación gratuita con API/IA.
 */
@Module({
  imports: [IaModule],
  providers: [CategoryAiModeratorService, CategoryModerationService],
  exports: [CategoryModerationService],
})
export class ModerationModule {}
