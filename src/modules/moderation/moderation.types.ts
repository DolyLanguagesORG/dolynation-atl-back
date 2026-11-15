import type { AIRequestOptions } from '../ia/providers/ai-provider.interface';

/** Capas secuenciales del pipeline de moderación de categorías dinámicas. */
export type ModerationLayer =
  'format' | 'blacklist' | 'regex' | 'openai_moderation' | 'ai_moderation';

/** Resultado de moderación para una categoría candidata individual. */
export interface CategoryModerationDecision {
  category: string;
  allowed: boolean;
  layer?: ModerationLayer;
  reason?: string;
}

/** Detalle seguro expuesto al cliente cuando una categoría es rechazada. */
export interface CategoryModerationRejection {
  category: string;
  layer: ModerationLayer;
  reason: string;
}

/** Opciones para ajustar la ejecución del pipeline de moderación. */
export interface ModerationOptions {
  /**
   * Si es `true`, omite el llamado de respaldo al LLM del sistema cuando no hay
   * entrada en caché, manteniendo activos blacklist, regex, caché y APIs gratuitas.
   */
  skipAiFallback?: boolean;
  /** Opciones internas para seleccionar proveedor o modelo de IA al moderar/generar blueprints. */
  aiOptions?: AIRequestOptions;
}
