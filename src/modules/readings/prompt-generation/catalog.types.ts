/** Identificador textual de categoría temática escrita por el usuario. */
export type CategoryId = string;

/** Niveles de dificultad aceptados al solicitar una lectura. */
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/** Niveles del Marco Común Europeo de Referencia (MCER / CEFR). */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** Longitudes configurables del texto generado. */
export type TextSize = 'short' | 'medium' | 'long';

/** Enfoques o géneros expositivos posibles para variar el estilo de las lecturas. */
export type ContentType =
  | 'historical_fact'
  | 'interesting_discovery'
  | 'how_it_works'
  | 'comparison'
  | 'evolution'
  | 'curious_phenomenon'
  | 'practical_application';

/** Perspectiva analítica desde la cual abordar el tema. */
export type ContentPerspective =
  'causes' | 'effects' | 'process' | 'comparison' | 'evolution' | 'benefits' | 'challenges';

/** Regiones geográficas utilizadas para diversificar ejemplos y contexto cultural. */
export type GeographicRegion = 'global' | 'europe' | 'asia' | 'americas' | 'africa' | 'oceania';

/** Resumen breve de una lectura previa del usuario usado para evitar repetición semántica. */
export interface RecentReadingSummary {
  title: string;
  description: string;
}

/** Dimensión versátil para abordar una categoría desde ángulos distintos en cada lectura. */
export interface ExplorationLens {
  id: string;
  label: string;
  guidance: string;
  weight: number;
  /** Si es `true`, solo se considera cuando no hay lecturas recientes o introductorias. */
  requiresFreshBasics?: boolean;
}

/** Definición de una categoría junto con su lista de subcategorías y guía editorial base. */
export interface CategoryConfig {
  id: CategoryId;
  name: string;
  editorialGuidance?: string;
  coreConcepts?: string[];
  subcategories: { id: string; name: string }[];
}

/** Rango de palabras y tiempo estimado de lectura asociado a un tamaño. */
export interface TextSizeConfig {
  min: number;
  max: number;
  label: TextSize;
  readingTime: string;
}

/** Reglas pedagógicas (CEFR, vocabulario y gramática) asociadas a una dificultad. */
export interface DifficultyConfig {
  id: DifficultyLevel;
  label: string;
  cefrLevels: readonly CefrLevel[];
  description: string;
  vocabularyGuidelines: string;
  grammarGuidelines: string;
}

/** Parámetros aleatorios y enriquecidos que alimentan la construcción del prompt final. */
export interface RandomPromptParams {
  category: string;
  difficulty: DifficultyLevel;
  size: TextSize;
  /** De 1 a 2 nombres de subcategorías elegidas para acotar la lectura. */
  subcategories: string[];
  /** Tipo de contenido elegido (ej. `"interesting_discovery"`). */
  contentType: ContentType;
  /** Lente analítico principal desde el cual abordar el texto (ej. `"causes"`). */
  perspective: ContentPerspective;
  /** Gancho narrativo único que explorará el LLM (ej. su impacto en la vida diaria). */
  uniqueFocusElement: string;
  /** Conceptos clave, hechos o vocabulario sugerido por el blueprint de la categoría. */
  keyConcepts?: string[];
  /** Guía editorial reutilizable proveniente del blueprint de la categoría. */
  editorialGuidance?: string;
  /** Títulos de lecturas recientes que deben evitarse para prevenir repeticiones. */
  avoidTopics?: string[];
  /** Títulos y descripciones recientes (hasta 10) para evitar repetición temática/semántica. */
  recentReadings?: RecentReadingSummary[];
  /** Código de idioma objetivo (ej. `"en"`, `"es"`, `"fr"`, `"it"`). Por defecto `"en"`. */
  language?: string;
  /** Semilla opcional para generar parámetros y prompts reproducibles. */
  seed?: string;
}

/** Plantilla lingüística versionada para un idioma objetivo admitido. */
export interface LanguagePromptTemplate {
  readonly language: 'es' | 'en' | 'fr' | 'it';
  readonly languageName: string;
  readonly version: string;
  readonly styleGuides: Readonly<Record<DifficultyLevel, string>>;
}

/** Resultado estructurado de la etapa de lluvia de ideas y enriquecimiento temático. */
export interface EnrichedTopic {
  subtopic: string;
  perspective: string;
  uniqueFocusElement: string;
  keyConcepts: string[];
  lensId?: string;
}

/** Parámetros de entrada para generar el prompt intermedio de enriquecimiento. */
export interface EnrichmentPromptParams {
  category: string;
  difficulty: DifficultyLevel;
  recentTitles?: string[];
  recentReadings?: readonly RecentReadingSummary[];
  excludedAngles?: readonly string[];
  lens?: ExplorationLens;
  randomAngle?: string;
  language?: string;
}

/** Salida final lista para enviarse al proveedor de IA junto con su semilla trazable. */
export interface GeneratedPrompt {
  systemPrompt: string;
  userPrompt: string;
  seed: string;
  templateVersion: string;
  params: RandomPromptParams;
}
