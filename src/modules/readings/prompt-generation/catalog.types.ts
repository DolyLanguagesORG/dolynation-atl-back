/** Identificadores base de las categorías predefinidas en el catálogo. */
export type CategoryId =
  'technology' | 'history' | 'education' | 'programming' | 'culture' | 'pop_culture';

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

/** Definición de una categoría junto con su lista de subcategorías. */
export interface CategoryConfig {
  id: CategoryId;
  name: string;
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
  /** Conceptos clave, hechos o vocabulario sugerido por el paso previo de enriquecimiento. */
  keyConcepts?: string[];
  /** Títulos de lecturas recientes que deben evitarse para prevenir repeticiones. */
  avoidTopics?: string[];
  /** Código de idioma objetivo (ej. `"en"`, `"es"`, `"fr"`, `"pt"`, `"de"`). Por defecto `"en"`. */
  language?: string;
}

/** Resultado estructurado de la etapa de lluvia de ideas y enriquecimiento temático. */
export interface EnrichedTopic {
  subtopic: string;
  perspective: string;
  uniqueFocusElement: string;
  keyConcepts: string[];
}

/** Parámetros de entrada para generar el prompt intermedio de enriquecimiento. */
export interface EnrichmentPromptParams {
  category: string;
  difficulty: DifficultyLevel;
  recentTitles?: string[];
  randomAngle?: string;
  language?: string;
}

/** Salida final lista para enviarse al proveedor de IA junto con su semilla trazable. */
export interface GeneratedPrompt {
  systemPrompt: string;
  userPrompt: string;
  seed: string;
  params: RandomPromptParams;
}
