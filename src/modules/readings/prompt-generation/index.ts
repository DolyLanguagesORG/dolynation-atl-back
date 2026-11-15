/** Reexportaciones públicas de constantes, tipos, utilidades y constructor de prompts. */
export { LANGUAGE_NAMES, PromptBuilderService } from './prompt-builder.service';
export {
  CEFR_BY_DIFFICULTY,
  READING_DIFFICULTIES,
  READING_TEXT_SIZES,
  READING_CEFR_LEVELS,
  GENERIC_UNIQUE_FOCUS,
  CREATIVE_PERSPECTIVE_ANGLES,
  VERSATILE_EXPLORATION_LENSES,
} from './catalog.constants';
export {
  pickRandom,
  resolveCefrLevel,
  getCategoryConfig,
  formatCategoryName,
  getUniqueFocusForCategory,
  selectBlueprintTopic,
  pickExplorationLens,
} from './catalog.helpers';
export type { SelectedBlueprintTopic } from './catalog.helpers';
export type {
  CategoryId,
  DifficultyLevel,
  CefrLevel,
  TextSize,
  ContentType,
  ContentPerspective,
  GeographicRegion,
  CategoryConfig,
  TextSizeConfig,
  DifficultyConfig,
  RandomPromptParams,
  GeneratedPrompt,
  EnrichedTopic,
  EnrichmentPromptParams,
  RecentReadingSummary,
  ExplorationLens,
} from './catalog.types';
