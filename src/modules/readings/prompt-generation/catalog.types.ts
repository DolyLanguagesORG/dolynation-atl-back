export type CategoryId =
  'technology' | 'history' | 'education' | 'programming' | 'culture' | 'pop_culture';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type TextSize = 'short' | 'medium' | 'long';

export type ContentType =
  | 'historical_fact'
  | 'interesting_discovery'
  | 'how_it_works'
  | 'comparison'
  | 'evolution'
  | 'curious_phenomenon'
  | 'practical_application';

export type ContentPerspective =
  'causes' | 'effects' | 'process' | 'comparison' | 'evolution' | 'benefits' | 'challenges';

export type GeographicRegion = 'global' | 'europe' | 'asia' | 'americas' | 'africa' | 'oceania';

export interface CategoryConfig {
  id: CategoryId;
  name: string;
  subcategories: { id: string; name: string }[];
}

export interface TextSizeConfig {
  min: number;
  max: number;
  label: TextSize;
  readingTime: string;
}

export interface DifficultyConfig {
  id: DifficultyLevel;
  label: string;
  cefrLevels: readonly CefrLevel[];
  description: string;
  vocabularyGuidelines: string;
  grammarGuidelines: string;
}

export interface RandomPromptParams {
  category: CategoryId;
  difficulty: DifficultyLevel;
  size: TextSize;
  /** 1–2 subcategory names from the chosen category, picked by the caller
   * (typically the controller's `generateRandomParams` decides them). */
  subcategories: string[];
  /** e.g. "interesting_discovery" — which kind of angle for the text. */
  contentType: ContentType;
  /** e.g. "causes" — which lens to look through. */
  perspective: ContentPerspective;
  /** The unique hook the LLM will explore (e.g. "its impact on daily life"). */
  uniqueFocusElement: string;
}

export interface GeneratedPrompt {
  systemPrompt: string;
  userPrompt: string;
  seed: string;
  params: RandomPromptParams;
}
