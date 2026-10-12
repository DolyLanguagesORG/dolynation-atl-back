import type {
  CategoryConfig,
  CategoryId,
  CefrLevel,
  ContentPerspective,
  ContentType,
  DifficultyConfig,
  DifficultyLevel,
  TextSize,
  TextSizeConfig,
} from './catalog.types';

export const CEFR_BY_DIFFICULTY: Record<DifficultyLevel, readonly CefrLevel[]> = {
  easy: ['A2', 'B1'],
  medium: ['B2'],
  hard: ['C1', 'C2'],
};

export const READING_CATEGORIES: readonly CategoryId[] = [
  'technology',
  'history',
  'education',
  'programming',
  'culture',
  'pop_culture',
] as const;

export const READING_DIFFICULTIES: readonly DifficultyLevel[] = ['easy', 'medium', 'hard'] as const;

export const READING_TEXT_SIZES: readonly TextSize[] = ['short', 'medium', 'long'] as const;

export const READING_CEFR_LEVELS: readonly CefrLevel[] = [
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2',
] as const;

export const TEXT_SIZES: Record<TextSize, TextSizeConfig> = {
  short: { min: 80, max: 120, label: 'short', readingTime: '~1 min' },
  medium: { min: 150, max: 220, label: 'medium', readingTime: '~2 min' },
  long: { min: 250, max: 350, label: 'long', readingTime: '~3 min' },
};

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

export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'technology',
    name: 'Technology',
    subcategories: [
      { id: 'smartphones', name: 'Smartphones and Mobile Technology' },
      { id: 'ai', name: 'Artificial Intelligence' },
      { id: 'cybersecurity', name: 'Cybersecurity' },
      { id: 'social_media', name: 'Social Media' },
      { id: 'robotics', name: 'Robotics' },
      { id: 'cloud', name: 'Cloud Computing' },
      { id: 'iot', name: 'Internet of Things' },
      { id: 'vr_ar', name: 'Virtual and Augmented Reality' },
    ],
  },
  {
    id: 'history',
    name: 'History',
    subcategories: [
      { id: 'ancient', name: 'Ancient Civilizations' },
      { id: 'medieval', name: 'Medieval Period' },
      { id: 'wars', name: 'Wars and Conflicts' },
      { id: 'industrial', name: 'Industrial Revolution' },
      { id: 'cultural', name: 'Cultural Movements' },
      { id: 'inventions', name: 'Famous Inventions' },
      { id: 'exploration', name: 'Exploration and Discovery' },
    ],
  },
  {
    id: 'education',
    name: 'Education',
    subcategories: [
      { id: 'learning', name: 'Learning Methods' },
      { id: 'online', name: 'Online Education' },
      { id: 'study', name: 'Study Techniques' },
      { id: 'psychology', name: 'Educational Psychology' },
      { id: 'languages', name: 'Language Learning' },
      { id: 'skills', name: 'Skills Development' },
    ],
  },
  {
    id: 'programming',
    name: 'Programming',
    subcategories: [
      { id: 'web', name: 'Web Development' },
      { id: 'databases', name: 'Databases' },
      { id: 'algorithms', name: 'Algorithms' },
      { id: 'software', name: 'Software Engineering' },
      { id: 'mobile', name: 'Mobile Development' },
      { id: 'devops', name: 'DevOps' },
      { id: 'security', name: 'Software Security' },
    ],
  },
  {
    id: 'culture',
    name: 'Culture',
    subcategories: [
      { id: 'music', name: 'Music' },
      { id: 'art', name: 'Visual Arts' },
      { id: 'literature', name: 'Literature' },
      { id: 'traditions', name: 'Traditions and Customs' },
      { id: 'cinema', name: 'Cinema' },
      { id: 'gastronomy', name: 'Gastronomy' },
      { id: 'architecture', name: 'Architecture' },
    ],
  },
  {
    id: 'pop_culture',
    name: 'Pop Culture',
    subcategories: [
      { id: 'anime_manga', name: 'Anime and Manga' },
      { id: 'disney', name: 'Disney' },
      { id: 'marvel', name: 'Marvel Universe' },
      { id: 'dc', name: 'DC Universe' },
      { id: 'pixar', name: 'Pixar Animation' },
      { id: 'gaming', name: 'Video Games' },
      { id: 'kpop', name: 'K-Pop and Asian Pop Culture' },
      { id: 'scifi_fantasy', name: 'Sci-Fi and Fantasy Franchises' },
      { id: 'fun_facts', name: 'Fun Facts and Trivia' },
    ],
  },
];

export const CONTENT_TYPE_DESCRIPTIONS: Record<ContentType, string> = {
  historical_fact: 'a historical fact or event',
  interesting_discovery: 'an interesting discovery or finding',
  how_it_works: 'an explanation of how something works',
  comparison: 'a comparison between two related concepts or things',
  evolution: 'the evolution or development of something over time',
  curious_phenomenon: 'a curious or surprising phenomenon',
  practical_application: 'a practical application or real-world use case',
};

export const PERSPECTIVE_DESCRIPTIONS: Record<ContentPerspective, string> = {
  causes: 'the causes and origins',
  effects: 'the effects and consequences',
  process: 'the process and methodology',
  comparison: 'comparisons and contrasts',
  evolution: 'evolution and changes over time',
  benefits: 'the benefits and advantages',
  challenges: 'the challenges and difficulties',
};

export const UNIQUE_FOCUS_BY_CATEGORY: Record<CategoryId, string[]> = {
  technology: [
    'its impact on daily life',
    'how it changed communication',
    'its unexpected origins',
    'common misconceptions about it',
    'its environmental implications',
    'how it affects human behavior',
    'its role in solving global problems',
    'the pioneers who made it possible',
  ],
  history: [
    'the key figures involved',
    'the lasting impact on society',
    'lesser-known facts',
    'how it shaped the modern world',
    'the cultural context of the time',
    'what we can learn from it today',
    'the causes that led to it',
    'how different groups experienced it',
  ],
  education: [
    'research-backed strategies',
    'common mistakes to avoid',
    'how technology is changing it',
    'cultural differences in approach',
    'the psychology behind it',
    'practical tips for implementation',
    'historical development of methods',
    'future trends and innovations',
  ],
  programming: [
    'real-world applications',
    'common pitfalls and how to avoid them',
    'evolution of best practices',
    'performance considerations',
    'security implications',
    'how beginners can get started',
    'advanced techniques for experts',
    'industry standards and conventions',
  ],
  culture: [
    'historical origins and evolution',
    'regional variations',
    'influence on modern society',
    'famous examples and masterpieces',
    'the creative process behind it',
    'social and political context',
    'cross-cultural comparisons',
    'preservation and future challenges',
  ],
  pop_culture: [
    'behind-the-scenes secrets and fun facts',
    'the creative minds and studios behind it',
    'its cultural impact and global influence',
    'interesting trivia fans might not know',
    'how it revolutionized its genre',
    'memorable characters and why fans love them',
    'connections between different franchises',
    'the evolution from original to modern adaptations',
  ],
};
