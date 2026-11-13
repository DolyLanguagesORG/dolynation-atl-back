/** Capas secuenciales del pipeline de moderación de categorías dinámicas. */
export type ModerationLayer =
  'format' | 'blacklist' | 'regex' | 'openai_moderation' | 'perspective_api' | 'ai_moderation';

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
   * Si es `true`, omite el llamado de respaldo al LLM del sistema (MiniMax) cuando no hay
   * entrada en caché, manteniendo activos blacklist, regex, caché y APIs gratuitas.
   */
  skipAiFallback?: boolean;
}
