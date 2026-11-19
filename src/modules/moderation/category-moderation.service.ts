import { Injectable, Optional } from '@nestjs/common';
import { AppConfigService } from '../../config/env.config';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { CategoryPromptProfile } from '../../database/drizzle/types';
import type { AIRequestOptions } from '../ia/providers/ai-provider.interface';
import { AuditLogService } from '../logs';
import { checkCategoryBlacklist } from './category-blacklist';
import { cleanCategoryDisplayName, normalizeCategoryNames } from './category-normalizer';
import { checkCategoryRegex } from './category-regex';
import { CategoryAiModeratorService } from './category-ai-moderator.service';
import type {
  CategoryModerationDecision,
  CategoryModerationRejection,
  ModerationOptions,
} from './moderation.types';

const MIN_CATEGORY_LENGTH = 2;
const MAX_CATEGORY_LENGTH = 50;

/**
 * Servicio orquestador de moderación de categorías dinámicas en tres capas:
 *   1. Blacklist normalizada (minúsculas, sin acentos/diéresis, sin espacios/leetspeak).
 *   2. Expresiones regulares (gibberish, spam, prompt injection, evasiones).
 *   3. API gratuita de moderación (OpenAI) y Decisions API de Google, más IA del sistema en batch con caché.
 */
@Injectable()
export class CategoryModerationService {
  constructor(
    private readonly config: AppConfigService,
    private readonly aiModerator: CategoryAiModeratorService,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

  /**
   * Limpia y deduplica un arreglo de categorías eliminando espacios extras y duplicados
   * insensibles a mayúsculas o acentos.
   */
  normalizeCategories(categories: readonly string[]): string[] {
    return normalizeCategoryNames(categories);
  }

  /**
   * Evalúa un listado de categorías a través de los tres filtros y devuelve
   * la decisión para cada una.
   */
  async evaluateCategories(
    categories: readonly string[],
    options?: ModerationOptions,
  ): Promise<CategoryModerationDecision[]> {
    const cleanedList = categories.map((c) => cleanCategoryDisplayName(c));

    if (!this.config.moderation.enabled) {
      return cleanedList.map((category) => ({ category, allowed: true }));
    }

    const preliminary = new Map<number, CategoryModerationDecision>();
    const pendingForAi: Array<{ index: number; category: string }> = [];

    for (const [i, category] of cleanedList.entries()) {
      // 0a. Longitud real tras limpiar espacios extremos
      if (category.length < MIN_CATEGORY_LENGTH || category.length > MAX_CATEGORY_LENGTH) {
        preliminary.set(i, {
          category,
          allowed: false,
          layer: 'format',
          reason: 'category_length_out_of_bounds',
        });
        continue;
      }

      // Capa 1: Blacklist normalizada
      const blacklist = checkCategoryBlacklist(category);
      if (blacklist.blocked) {
        preliminary.set(i, {
          category,
          allowed: false,
          layer: 'blacklist',
          reason: blacklist.reason ?? 'prohibited_content',
        });
        continue;
      }

      // Capa 2: Expresiones regulares (gibberish, spam, prompt injection, patrones dañinos)
      const regex = checkCategoryRegex(category);
      if (regex.blocked) {
        preliminary.set(i, {
          category,
          allowed: false,
          layer: 'regex',
          reason: regex.reason ?? 'invalid_format_or_gibberish',
        });
        continue;
      }

      pendingForAi.push({ index: i, category });
    }

    // Capa 3: API gratuita de moderación + IA del sistema en lote (solo si aprobó capas 1 y 2)
    if (pendingForAi.length > 0) {
      const aiResults = await this.aiModerator.moderateBatch(
        pendingForAi.map((item) => item.category),
        options,
      );
      for (const [j, target] of pendingForAi.entries()) {
        const aiDecision = aiResults.at(j) ?? { category: target.category, allowed: true };
        preliminary.set(target.index, aiDecision);
      }
    }

    return cleanedList.map((category, idx) => preliminary.get(idx) ?? { category, allowed: true });
  }

  /**
   * Valida y normaliza un arreglo de categorías; lanza `CATEGORY_MODERATION_REJECTED` (400)
   * si al menos una categoría falla cualquiera de los tres filtros.
   */
  async assertCategoriesAllowed(
    categories: readonly string[],
    options?: ModerationOptions,
  ): Promise<string[]> {
    const normalized = this.normalizeCategories(categories);
    const decisions = await this.evaluateCategories(normalized, options);
    const rejected: CategoryModerationRejection[] = [];

    for (const decision of decisions) {
      if (!decision.allowed) {
        rejected.push({
          category: decision.category,
          layer: decision.layer ?? 'ai_moderation',
          reason: decision.reason ?? 'prohibited_content',
        });
      }
    }

    if (rejected.length > 0) {
      await this.auditLogs?.logEvent({
        module: 'moderation',
        action: 'MODERATION',
        event: 'moderation.categories_rejected',
        entityType: 'moderated_categories',
        summary: `Rejected ${rejected.length} category candidate(s): ${rejected.map((r) => r.category).join(', ')}`,
        metadata: { rejected },
      });
      throw new AppHttpException(ErrorCode.CATEGORY_MODERATION_REJECTED, {
        rejected,
      });
    }

    return normalized;
  }

  /**
   * Resuelve el blueprint editorial global cacheado o generado bajo demanda para una categoría
   * escrita por el usuario, construyendo lecturas en una sola llamada de IA.
   */
  async getOrBuildCategoryBlueprint(
    category: string,
    aiOptions?: AIRequestOptions,
  ): Promise<CategoryPromptProfile | null> {
    const cleaned = cleanCategoryDisplayName(category);
    if (!cleaned) {
      return null;
    }

    if (typeof this.aiModerator.getOrCreateCategoryProfile === 'function') {
      return aiOptions !== undefined
        ? this.aiModerator.getOrCreateCategoryProfile(cleaned, aiOptions)
        : this.aiModerator.getOrCreateCategoryProfile(cleaned);
    }

    return null;
  }

  /**
   * Segunda barrera de defensa para generación de lecturas (`POST /readings`):
   * aplica blacklist, regex, caché y API gratuita sin disparar llamadas extra al LLM del sistema.
   */
  async assertCategoryAllowedForReading(category: string): Promise<void> {
    await this.assertCategoriesAllowed([category], { skipAiFallback: true });
  }
}
