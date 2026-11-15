import type {
  CefrLevel,
  ContentPerspective,
  ContentType,
  DifficultyConfig,
  DifficultyLevel,
  ExplorationLens,
  TextSize,
  TextSizeConfig,
} from './catalog.types';

/** Mapeo de niveles de dificultad generales a los niveles CEFR correspondientes. */
export const CEFR_BY_DIFFICULTY: Record<DifficultyLevel, readonly CefrLevel[]> = {
  easy: ['A2', 'B1'],
  medium: ['B2'],
  hard: ['C1', 'C2'],
};

/** Niveles de dificultad aceptados al generar una lectura. */
export const READING_DIFFICULTIES: readonly DifficultyLevel[] = ['easy', 'medium', 'hard'] as const;

/** Tamaños de texto soportados para las lecturas generadas. */
export const READING_TEXT_SIZES: readonly TextSize[] = ['short', 'medium', 'long'] as const;

/** Niveles CEFR completos expuestos como referencia en las opciones de generación. */
export const READING_CEFR_LEVELS: readonly CefrLevel[] = [
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2',
] as const;

/** Configuración de rango de palabras y tiempo estimado de lectura por tamaño. */
export const TEXT_SIZES: Record<TextSize, TextSizeConfig> = {
  short: { min: 80, max: 120, label: 'short', readingTime: '~1 min' },
  medium: { min: 150, max: 220, label: 'medium', readingTime: '~2 min' },
  long: { min: 250, max: 350, label: 'long', readingTime: '~3 min' },
};

/** Lineamientos pedagógicos de vocabulario y gramática enviados al LLM según dificultad. */
export const DIFFICULTY_LEVELS: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    id: 'easy',
    label: 'Beginner',
    cefrLevels: ['A1', 'A2'],
    description: 'A1-A2 level (Beginner to Elementary)',
    vocabularyGuidelines:
      'Use only basic, everyday vocabulary (around 500-1000 most common words). Avoid idioms, phrasal verbs, and technical terms.',
    grammarGuidelines:
      'Use simple present, simple past, and simple future. Short sentences (8-12 words). Avoid complex structures like conditionals, passive voice, or relative clauses.',
  },
  medium: {
    id: 'medium',
    label: 'Intermediate',
    cefrLevels: ['B1', 'B2'],
    description: 'B1-B2 level (Intermediate to Upper-Intermediate)',
    vocabularyGuidelines:
      'Use intermediate vocabulary with some less common words. Include common idioms and phrasal verbs. Topic-specific vocabulary is acceptable with context.',
    grammarGuidelines:
      'Use a variety of tenses including perfect tenses and conditionals. Medium-length sentences (12-20 words). Can include passive voice and relative clauses.',
  },
  hard: {
    id: 'hard',
    label: 'Advanced',
    cefrLevels: ['C1', 'C2'],
    description: 'C1-C2 level (Advanced to Proficiency)',
    vocabularyGuidelines:
      'Use sophisticated vocabulary including academic and specialized terms. Include idiomatic expressions, collocations, and nuanced word choices.',
    grammarGuidelines:
      'Use complex grammatical structures freely: mixed conditionals, subjunctive, cleft sentences, inversion. Longer, compound-complex sentences are encouraged.',
  },
};

/** Descripciones textuales en inglés de los tipos de contenido para construir prompts. */
export const CONTENT_TYPE_DESCRIPTIONS: Record<ContentType, string> = {
  historical_fact: 'a historical fact or event',
  interesting_discovery: 'an interesting discovery or finding',
  how_it_works: 'an explanation of how something works',
  comparison: 'a comparison between two related concepts or things',
  evolution: 'the evolution or development of something over time',
  curious_phenomenon: 'a curious or surprising phenomenon',
  practical_application: 'a practical application or real-world use case',
};

/** Descripciones textuales en inglés de las perspectivas analíticas para los prompts. */
export const PERSPECTIVE_DESCRIPTIONS: Record<ContentPerspective, string> = {
  causes: 'the causes and origins',
  effects: 'the effects and consequences',
  process: 'the process and methodology',
  comparison: 'comparisons and contrasts',
  evolution: 'evolution and changes over time',
  benefits: 'the benefits and advantages',
  challenges: 'the challenges and difficulties',
};

/** Enfoques narrativos genéricos usados como respaldo para categorías personalizadas. */
export const GENERIC_UNIQUE_FOCUS: readonly string[] = [
  'its unexpected origins and early history',
  'how it quietly impacts daily life and society',
  'a little-known breakthrough or failure that led to success',
  'common misconceptions and myths surrounding it',
  'the environmental, ethical, or human implications',
  'how it operates at a fundamental or microscopic level',
  'a fascinating paradox or curious phenomenon related to it',
  'forgotten pioneers or innovators who made it possible',
  'how it might evolve or reshape the future',
  'a surprising real-world application in an unexpected field',
];

/** Dimensiones versátiles de exploración para evitar introducciones repetitivas y ampliar el enfoque por categoría. */
export const VERSATILE_EXPLORATION_LENSES: readonly ExplorationLens[] = [
  {
    id: 'iconic_figure_or_thinker',
    label: 'Single Figure, Creator, or Thinker Spotlight',
    guidance:
      'Zoom into ONE specific philosopher, artist, chronicler, innovator, or key figure inside this category (for example, Plato alone, Nietzsche alone, or José Guadalupe Posada), examining one concrete idea or work rather than summarizing the entire field.',
    weight: 2,
  },
  {
    id: 'pop_culture_cinema_media',
    label: 'Cinema, Literature & Pop Culture Impact',
    guidance:
      'Explore how ONE specific film, animated movie, book, series, museum show, or music work portrays, spreads, or transforms this category (for example, Coco for Día de Muertos or philosophical sci-fi cinema), highlighting cultural details and accuracy.',
    weight: 2,
  },
  {
    id: 'regional_contrast_variation',
    label: 'Regional Contrast & Lesser-Known Variations',
    guidance:
      'Contrast two distinct regions, local customs, or competing schools of thought within this exact category (for example, northern vs southern traditions or contrasting communities), revealing differences most outsiders miss.',
    weight: 2,
  },
  {
    id: 'specific_historical_episode',
    label: 'Specific Year, Controversy, or Turning Point',
    guidance:
      'Focus tightly on ONE specific historical year, festival episode, cultural debate, institutional shift, or revival strictly centered on this category, without drifting into unrelated macro-history.',
    weight: 2,
  },
  {
    id: 'surprising_trivia_and_facts',
    label: 'Surprising Trivia & Counter-Intuitive Facts',
    guidance:
      'Share genuinely surprising, "you probably did not know this" facts, hidden science, craftsmanship economics, or common misconceptions strictly about this category—skipping all beginner definitions.',
    weight: 2,
  },
  {
    id: 'single_artifact_symbol_or_paradox',
    label: 'Single Artifact, Ritual, or Thought Experiment',
    guidance:
      'Dedicate the entire piece to unpacking ONE concrete symbol, traditional item, culinary detail, ritual, or famous paradox/thought experiment within this category.',
    weight: 2,
  },
  {
    id: 'modern_evolution_and_debate',
    label: 'Modern Shifts, Globalization & Debates',
    guidance:
      'Examine how this category is changing today through urban life, digital culture, modern ethics, tourism, or generational shifts while remaining rooted in the core subject.',
    weight: 2,
  },
  {
    id: 'fresh_foundational_angle',
    label: 'Nuanced Non-Cliché Foundations',
    guidance:
      'Offer a fresh, intellectually engaging perspective on essential roots of this category without using generic encyclopedia openings or boilerplate "blend of X and Y" templates.',
    weight: 1,
    requiresFreshBasics: true,
  },
];

/** Ángulos creativos sugeridos durante la etapa intermedia de enriquecimiento temático. */
export const CREATIVE_PERSPECTIVE_ANGLES: readonly string[] = VERSATILE_EXPLORATION_LENSES.map(
  (lens) => lens.guidance,
);
