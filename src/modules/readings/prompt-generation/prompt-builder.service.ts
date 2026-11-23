import { Injectable } from '@nestjs/common';
import {
  CONTENT_TYPE_DESCRIPTIONS,
  DIFFICULTY_LEVELS,
  PERSPECTIVE_DESCRIPTIONS,
  READING_DIFFICULTIES,
  READING_TEXT_SIZES,
  TEXT_SIZES,
} from './catalog.constants';
import type { CategoryPromptProfile } from '../../../database/drizzle/types';
import { normalizeSmartQuoteStrings } from '../../ia/ai-json';
import {
  getCategoryConfig,
  getUniqueFocusForCategory,
  pickExplorationLens,
  pickRandom,
  resolveCefrLevel,
  selectBlueprintTopic,
} from './catalog.helpers';
import type {
  CategoryConfig,
  CefrLevel,
  DifficultyLevel,
  EnrichedTopic,
  EnrichmentPromptParams,
  GeneratedPrompt,
  RandomPromptParams,
  RecentReadingSummary,
  TextSize,
  TextSizeConfig,
} from './catalog.types';

/** Máximo de lecturas recientes consideradas en contexto anti-repetición. */
const MAX_RECENT_READINGS_CONTEXT = 10;

/** Nombres de idioma legibles inyectados en las instrucciones de los prompts al LLM. */
export const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  it: 'Italian',
};

/** Parámetros para construir el prompt de ayuda contextual y glosario de palabras/oraciones. */
export interface ExplanationPromptParams {
  word: string;
  entryType: 'word' | 'phrase';
  language: string;
  difficulty: string;
  readingTitle?: string;
  readingContent?: string;
  context?: string;
}

/** Instrucciones pedagógicas por nivel CEFR para las explicaciones contextuales. */
const EXPLANATION_LEVEL_GUIDES: Record<string, string> = {
  easy: 'Beginner (A1-A2): explain simply using short everyday sentences, concrete comparisons, and accessible grammar labels without technical jargon.',
  medium:
    'Intermediate (B1-B2): explain clearly with practical nuance, everyday grammatical categories, and helpful register hints.',
  hard: 'Advanced / Native-like (C1-C2): explain like an educated native speaker to another fluent reader, covering pragmatic tone, subtle nuance, and register.',
};

/** Guías lingüísticas y pedagógicas aisladas por idioma y nivel CEFR para evitar contaminación cruzada. */
const LANGUAGE_STYLE_GUIDES: Record<string, Record<DifficultyLevel, string>> = {
  es: {
    easy: 'Write natural, neutral Spanish at A1-A2 level: present tense, basic preterite/imperfect, concrete everyday vocabulary, short sentences, and simple connectors (primero, además, por eso). Every single word must be purely Spanish.',
    medium:
      'Write natural, neutral Spanish at B1-B2 level: varied tenses including compound past and conditionals, passive "se", and smooth transitions (sin embargo, por lo tanto, aunque). Every single word must be purely Spanish.',
    hard: 'Write authentic educated Spanish at C1-C2 level: nuanced subjunctive, precise nominalizations, idiomatic connectors, and rich domain vocabulary. Every single word must be purely Spanish.',
  },
  en: {
    easy: 'Write clear standard English at A1-A2 level: rely on high-frequency words, crisp subject-verb-object sentences, and simple connectors without idioms or technical jargon.',
    medium:
      'Write clear standard English at B1-B2 level: combine relative clauses, everyday phrasal verbs, conditionals, and smooth transitions (however, moreover, as a result).',
    hard: 'Write sophisticated standard English at C1-C2 level: employ academic collocations, complex subordination, cleft structures, and nuanced specialized terminology.',
  },
  fr: {
    easy: "Write authentic standard French at A1-A2 level (exact accents, elisions, and agreement): use présent, passé composé, futur proche, concrete everyday vocabulary, and short clear sentences (d'abord, ensuite, donc). Every single word must be purely French.",
    medium:
      'Write authentic standard French at B1-B2 level (exact accents and agreement): combine imparfait, conditionnel, pronoms relatifs, and logical markers (cependant, en effet, ainsi, par ailleurs). Every single word must be purely French.',
    hard: 'Write authentic educated French at C1-C2 level (impeccable accents and syntax): use subjonctif, nominal structures, idiomatic expressions, and authentic French technical terms. Every single word must be purely French.',
  },
  it: {
    easy: 'Write natural standard Italian at A1-A2 level (exact accents, articles, and agreement): use presente, passato prossimo, concrete high-frequency vocabulary, and short clear sentences (prima, poi, per questo). Every single word must be purely Italian.',
    medium:
      'Write natural standard Italian at B1-B2 level (exact articles and agreement): combine imperfetto, condizionale, combined pronouns, and connectors (tuttavia, quindi, inoltre). Every single word must be purely Italian.',
    hard: 'Write authentic essay-style Italian at C1-C2 level (impeccable accents and register): use congiuntivo, passive/impersonal "si" constructions, nuanced idioms, and specialized Italian vocabulary. Every single word must be purely Italian.',
  },
};

/**
 * Servicio constructor de prompts en dos pasos (enriquecimiento temático + generación final)
 * y proveedor de opciones estáticas del catálogo de lecturas.
 */
@Injectable()
export class PromptBuilderService {
  /**
   * Paso 1 (Prompt intermedio): Construye el prompt de enriquecimiento enviado al LLM
   * para proponer un subtema específico, original y sin clichés, junto con una perspectiva
   * única y conceptos clave, prohibiendo repetir las lecturas recientes del usuario.
   */
  buildEnrichmentPrompt(params: EnrichmentPromptParams): {
    systemPrompt: string;
    userPrompt: string;
    seed: string;
  } {
    const categoryConfig = getCategoryConfig(params.category);
    const difficulty = DIFFICULTY_LEVELS[params.difficulty];
    const recentSummaries = normalizeRecentEntries(
      params.recentReadings,
      params.recentTitles,
      MAX_RECENT_READINGS_CONTEXT,
    );
    const selectedLens = params.lens ?? pickExplorationLens(recentSummaries);
    const creativeAngle = params.randomAngle ?? selectedLens.guidance;
    const langLabel = LANGUAGE_NAMES[params.language?.toLowerCase() ?? 'en'] ?? 'English';

    const systemPrompt = `
You curate highly original, deeply informative reading topic ideas for ${langLabel} learners (${difficulty.description}).
Respond ONLY with a valid JSON object (no markdown fences, no commentary):
{
  "subtopic": "<specific, surprising subtopic title strictly inside ${params.category}, written strictly in ${langLabel}>",
  "perspective": "<concise analytical angle strictly in ${langLabel}>",
  "uniqueFocusElement": "<one vivid concrete focus—such as a specific thinker, film/work, regional contrast, historical year/episode, paradox, or little-known fact—strictly in ${langLabel}>",
  "keyConcepts": ["3 to 5 authentic domain vocabulary terms strictly in ${langLabel} appropriate for ${difficulty.label} learners"]
}
RULES:
1. NEVER propose a generic "What is X" definition or cliché textbook origin summary unless basics are completely absent AND no recent readings exist.
2. Go far and versatile within "${params.category}" (figures, cinema/pop culture, regional traditions, surprising trivia, debates, specific years, or artifacts), while keeping the focus 100% relevant to "${params.category}"—never drift to unrelated macro-history or tangential topics.
3. Keep every JSON string value in pure natural ${langLabel}.
    `.trim();

    const formattedRecent = recentSummaries.map((entry) =>
      entry.description
        ? `- "${entry.title}" (Summary: ${entry.description})`
        : `- "${entry.title}"`,
    );

    const antiRepetitionSection =
      formattedRecent.length > 0
        ? `ANTI-REPETITION CONSTRAINT: Avoid reusing the same ideas, explanations, theses, or examples as ANY of these up to ${MAX_RECENT_READINGS_CONTEXT} recent readings:\n${formattedRecent.join('\n')}`
        : `Avoid encyclopedia overviews or boilerplate introductions; dive straight into a concrete, intriguing phenomenon, work, figure, or surprising contrast.`;

    const excludedSection =
      params.excludedAngles && params.excludedAngles.length > 0
        ? `\nREJECTED SIMILAR ANGLES (strictly avoid expressing anything close to these):\n${params.excludedAngles.map((a) => `- ${a}`).join('\n')}`
        : '';

    const userPrompt =
      `Topic/Category: "${params.category}" (${categoryConfig.name}) | Target language: ${langLabel} | Level: ${difficulty.description} | Exploration lens (${selectedLens.label}): ${creativeAngle}
${antiRepetitionSection}${excludedSection}
Propose one fresh, concrete, engaging facet centered tightly on "${params.category}" plus 3-5 useful ${langLabel} vocabulary terms aligned with ${difficulty.label}.`.trim();

    const seed = `enrich_${params.category.slice(0, 4)}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;

    return { systemPrompt, userPrompt, seed };
  }

  /**
   * Parsea de forma segura la salida del prompt intermedio de enriquecimiento en un `EnrichedTopic`.
   * Si falla el análisis JSON o faltan campos, devuelve el respaldo sin interrumpir el flujo.
   */
  parseEnrichmentResponse(raw: string, fallback: EnrichedTopic): EnrichedTopic {
    try {
      const cleaned = normalizeSmartQuoteStrings(
        raw
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim(),
      );

      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        return fallback;
      }

      const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as {
        subtopic?: string;
        perspective?: string;
        uniqueFocusElement?: string;
        keyConcepts?: string[];
      };

      if (!parsed.subtopic || typeof parsed.subtopic !== 'string') {
        return fallback;
      }

      return {
        subtopic: parsed.subtopic.trim(),
        perspective:
          typeof parsed.perspective === 'string' && parsed.perspective.trim().length > 0
            ? parsed.perspective.trim()
            : fallback.perspective,
        uniqueFocusElement:
          typeof parsed.uniqueFocusElement === 'string' &&
          parsed.uniqueFocusElement.trim().length > 0
            ? parsed.uniqueFocusElement.trim()
            : fallback.uniqueFocusElement,
        keyConcepts: Array.isArray(parsed.keyConcepts)
          ? parsed.keyConcepts.filter((k) => typeof k === 'string' && k.trim().length > 0)
          : fallback.keyConcepts,
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Genera un `EnrichedTopic` procedimental de respaldo a partir de las constantes del catálogo o ajustes dinámicos.
   */
  buildFallbackEnrichedTopic(category: string, _difficulty?: DifficultyLevel): EnrichedTopic {
    const categoryConfig = getCategoryConfig(category);
    const subcategory = pickRandom(categoryConfig.subcategories).name;
    const focusPool = getUniqueFocusForCategory(category);
    const uniqueFocus = pickRandom(focusPool);
    const perspective = pickRandom(Object.values(PERSPECTIVE_DESCRIPTIONS));

    return {
      subtopic: subcategory,
      perspective,
      uniqueFocusElement: uniqueFocus,
      keyConcepts: [],
    };
  }

  /**
   * Paso 2: Construye el prompt completo que recibe el LLM para redactar la lectura final.
   *
   * Inyecta el subtema enriquecido y los conceptos clave del paso intermedio,
   * aplicando las guías de vocabulario y gramática CEFR según la dificultad.
   */
  buildPrompt(params: RandomPromptParams): GeneratedPrompt {
    return {
      systemPrompt: this.buildSystemPrompt(params.category, params.language),
      userPrompt: this.buildUserPrompt(params),
      params,
      seed: this.generateSeed(params),
    };
  }

  /**
   * Genera un objeto de parámetros aleatorio pero válido. Se usa como respaldo cuando
   * faltan campos categóricos en el cuerpo de la petición.
   */
  generateRandomParams(partial?: Partial<RandomPromptParams>): RandomPromptParams {
    const trimmedCategory = partial?.category?.trim();
    const category = trimmedCategory && trimmedCategory.length > 0 ? trimmedCategory : 'general';
    const difficulty = partial?.difficulty ?? pickRandom(READING_DIFFICULTIES);
    const size = partial?.size ?? pickRandom(READING_TEXT_SIZES);
    const categoryConfig = getCategoryConfig(category);
    const subcategories = (partial?.subcategories ?? []).length
      ? (partial?.subcategories ?? [])
      : [pickRandom(categoryConfig.subcategories).name];
    const focusPool = getUniqueFocusForCategory(category);

    return {
      category,
      difficulty,
      size,
      subcategories,
      contentType:
        partial?.contentType ??
        pickRandom(Object.keys(CONTENT_TYPE_DESCRIPTIONS) as RandomPromptParams['contentType'][]),
      perspective:
        partial?.perspective ??
        pickRandom(Object.keys(PERSPECTIVE_DESCRIPTIONS) as RandomPromptParams['perspective'][]),
      uniqueFocusElement: partial?.uniqueFocusElement ?? pickRandom(focusPool),
      keyConcepts: partial?.keyConcepts,
      editorialGuidance: partial?.editorialGuidance,
      avoidTopics: partial?.avoidTopics,
      ...(partial?.recentReadings !== undefined
        ? { recentReadings: partial.recentReadings.slice(0, MAX_RECENT_READINGS_CONTEXT) }
        : {}),
      ...(partial?.language !== undefined ? { language: partial.language } : {}),
    };
  }

  /**
   * Construye parámetros aleatorios y anti-repetitivos en TypeScript a partir del blueprint global
   * cacheado para la categoría, conservando respaldo procedimental sin llamadas extra de IA.
   */
  buildParamsFromBlueprint(options: {
    category: string;
    difficulty: DifficultyLevel;
    size: TextSize;
    language: string;
    blueprint: CategoryPromptProfile | null;
    recentTitles?: readonly string[];
    recentReadings?: readonly RecentReadingSummary[];
  }): RandomPromptParams {
    const resolvedBlueprint = options.blueprint;
    const boundedTitles = options.recentTitles?.slice(0, MAX_RECENT_READINGS_CONTEXT);
    const boundedReadings = options.recentReadings?.slice(0, MAX_RECENT_READINGS_CONTEXT);
    if (resolvedBlueprint) {
      const selected = selectBlueprintTopic(resolvedBlueprint, boundedTitles);
      return this.generateRandomParams({
        category: options.category,
        difficulty: options.difficulty,
        size: options.size,
        language: options.language,
        subcategories: [selected.subtopic],
        uniqueFocusElement: selected.uniqueFocusElement,
        keyConcepts: selected.keyConcepts,
        editorialGuidance: resolvedBlueprint.editorialGuidance,
        ...(boundedTitles ? { avoidTopics: [...boundedTitles] } : {}),
        ...(boundedReadings ? { recentReadings: [...boundedReadings] } : {}),
      });
    }

    const fallback = this.buildFallbackEnrichedTopic(options.category, options.difficulty);
    return this.generateRandomParams({
      category: options.category,
      difficulty: options.difficulty,
      size: options.size,
      language: options.language,
      subcategories: [fallback.subtopic],
      uniqueFocusElement: fallback.uniqueFocusElement,
      keyConcepts: fallback.keyConcepts,
      ...(boundedTitles ? { avoidTopics: [...boundedTitles] } : {}),
      ...(boundedReadings ? { recentReadings: [...boundedReadings] } : {}),
    });
  }

  /**
   * Devuelve el nivel CEFR que corresponde persistir junto con la lectura.
   */
  resolveCefrLevelFor(difficulty: DifficultyLevel): CefrLevel {
    return resolveCefrLevel(difficulty);
  }

  /** No existen categorías predefinidas en el sistema; todas son definidas por cada usuario. */
  getAvailableCategories(): CategoryConfig[] {
    return [];
  }

  /** Devuelve la configuración estática de longitudes (usada por `/readings/options`). */
  getAvailableSizes(): TextSizeConfig[] {
    return Object.values(TEXT_SIZES);
  }

  /**
   * Construye el prompt de sistema exclusivo en JSON que fija el formato de salida
   * e indica al LLM qué tipo de contenido no es aceptable (historias,
   * personajes o narración en primera persona).
   */
  private buildSystemPrompt(category?: string, language?: string): string {
    const categoryInstruction = category ?? '<user category>';
    const langLabel = LANGUAGE_NAMES[language?.toLowerCase() ?? 'en'] ?? 'English';

    return `
You are an educational expository writer for ${langLabel} learners. Write an informative, logically structured article strictly in ${langLabel} (do not create stories, characters, personal names, anecdotes, or first-person narrative).
Write with an engaging, lively, conversational-informative tone—as if sharing surprising real-world facts with a curious learner—while remaining strictly factual expository prose.
IMPORTANT: Every word in "title", "description", and "content" MUST be pure natural ${langLabel}. Never mix English words, foreign terms, phonetic hints, camelCase word splices, or non-${langLabel} scripts.
JSON SAFETY: Never place unescaped ASCII double quotes (") inside string values; use «guillemets» or single quotes (') instead.

Respond ONLY with a valid JSON object in this exact format (no markdown or commentary):
{
  "title": "<concise engaging title strictly in ${langLabel}>",
  "description": "<1-2 sentence summary strictly in ${langLabel}>",
  "content": "<cohesive multi-paragraph expository text strictly in ${langLabel}, separated by \\n\\n>",
  "category": "${categoryInstruction}",
  "difficulty": "easy | medium | hard"
}
    `.trim();
  }

  /**
   * Prompt de usuario que define tema, longitud, nivel, estructura y estilo de redacción para el LLM.
   */
  private buildUserPrompt(params: RandomPromptParams): string {
    const categoryConfig = getCategoryConfig(params.category);
    const difficulty = DIFFICULTY_LEVELS[params.difficulty];
    const textSize = TEXT_SIZES[params.size];
    const contentTypeDesc = CONTENT_TYPE_DESCRIPTIONS[params.contentType];
    const perspectiveDesc = PERSPECTIVE_DESCRIPTIONS[params.perspective];
    const normalizedLang = params.language?.toLowerCase() ?? 'en';
    const langLabel = LANGUAGE_NAMES[normalizedLang] ?? 'English';
    const difficultyGuides = LANGUAGE_STYLE_GUIDES[normalizedLang] ?? LANGUAGE_STYLE_GUIDES['en'];
    const langGuide = difficultyGuides[params.difficulty] ?? difficultyGuides.medium;
    const subtopicLine =
      params.subcategories.length === 1 &&
      params.subcategories[0]?.trim().toLowerCase() === categoryConfig.name.trim().toLowerCase()
        ? `- Primary topic & dynamic category: ${categoryConfig.name}`
        : `- Primary topic: ${categoryConfig.name}, focusing on ${params.subcategories.join(' and ')}`;
    const editorialGuidanceLine = params.editorialGuidance?.trim()
      ? `- Editorial guidance: ${params.editorialGuidance.trim()}\n`
      : '';
    const keyConceptsLine =
      params.keyConcepts && params.keyConcepts.length > 0
        ? `- Key concepts to weave in: ${params.keyConcepts.join(', ')} (adapt naturally into ${langLabel})\n`
        : '';
    const recentEntries = normalizeRecentEntries(
      params.recentReadings,
      params.avoidTopics,
      MAX_RECENT_READINGS_CONTEXT,
    );
    const avoidTopicsSection =
      recentEntries.length > 0
        ? `\nAVOID REPETITION:\n- Do NOT reuse, paraphrase, or closely imitate the thesis, facts, or angles of these recent readings:\n${recentEntries
            .map((entry) =>
              entry.description
                ? `  * "${entry.title}" — ${entry.description}`
                : `  * "${entry.title}"`,
            )
            .join('\n')}\n`
        : '';

    return `
Write an informative reading article in ${langLabel}:

TOPIC & VOCABULARY:
${subtopicLine} (category: "${params.category}")
- Content type: ${contentTypeDesc} | Perspective: ${perspectiveDesc}
- Unique angle: ${params.uniqueFocusElement}
${editorialGuidanceLine}${keyConceptsLine}- Illustrate practical ${langLabel} vocabulary for "${categoryConfig.name}" naturally in context (translate any thematic hints into natural ${langLabel}).
- TOPICAL FOCUS & OPENING RULE: Jump straight into the specific subtopic, figure, work, contrast, or surprising fact in paragraph 1—NEVER open with a dictionary definition ("What is ${categoryConfig.name}" or boilerplate origin summaries). Stay tightly anchored to "${params.category}" in every paragraph without drifting to unrelated topics.
${avoidTopicsSection}
STRUCTURE & COHERENCE REQUIREMENTS:
- Organize "content" into 2–4 cohesive paragraphs separated by \\n\\n (opening angle -> mechanisms/contrasts -> synthesis).
- Length: ${textSize.min}-${textSize.max} words (${textSize.label} length, ${textSize.readingTime} reading time) — judge naturally by paragraph fullness rather than counting words one by one.
- Write 100% of "title", "description", and "content" in ${langLabel} (natural prose, no bullet points or headings): ${langGuide}

LEVEL (${difficulty.label}):
- Target level: ${difficulty.description}
- VOCABULARY: ${difficulty.vocabularyGuidelines}
- GRAMMAR: ${difficulty.grammarGuidelines}
- Output metadata: JSON "category" MUST be "${params.category}" and JSON "difficulty" MUST be "${difficulty.id}".
    `.trim();
  }

  /**
   * Construye el prompt pedagógico de ayuda contextual para una palabra u oración completa,
   * adaptando la profundidad al nivel de la lectura y exigiendo salida 100% en el idioma objetivo.
   */
  buildExplanationPrompt(params: ExplanationPromptParams): {
    systemPrompt: string;
    userPrompt: string;
  } {
    const normalizedLang = params.language.toLowerCase();
    const langLabel = LANGUAGE_NAMES[normalizedLang] ?? 'English';
    const normalizedLevel = params.difficulty.toLowerCase();
    const levelGuide =
      EXPLANATION_LEVEL_GUIDES[normalizedLevel] ?? EXPLANATION_LEVEL_GUIDES['medium'];
    const selectionKind = params.entryType === 'phrase' ? 'expression/sentence' : 'single word';

    const systemPrompt = `You are a ${langLabel} vocabulary explainer and language coach for learners (target level: ${normalizedLevel}).
IMPORTANT RULES:
1. This is an explanatory help & glossary system, NOT a bilingual translator. Write 100% of EVERY string value in the JSON exclusively in natural ${langLabel}. Never translate into or mix words from any other language.
2. Pedagogical depth (${normalizedLevel}): ${levelGuide}
3. Ground your main explanation directly in what is happening in the provided reading text, while contrasting the literal dictionary sense with its real contextual meaning.
4. Never place unescaped ASCII double quotes (") inside JSON string values; use «guillemets» or single quotes (') instead.
5. Respond ONLY with a valid JSON object (no markdown fences, no commentary) using this exact structure:
{
  "literalMeaning": "<string strictly in ${langLabel}: literal word-for-word or base dictionary meaning>",
  "explanation": "<string strictly in ${langLabel}: 2-4 clear sentences explaining what this ${selectionKind} means specifically in this reading passage>",
  "wordBreakdown": [
    {
      "token": "<word as it appears in the selection>",
      "lemma": "<dictionary base form>",
      "partOfSpeech": "<grammatical category written in ${langLabel}>",
      "literalDefinition": "<concise dictionary definition of this single word in ${langLabel}>",
      "roleInPhrase": "<short note in ${langLabel} on its role inside this selection>"
    }
  ],
  "otherWaysToSay": [
    {
      "expression": "<natural, everyday, educational alternative in ${langLabel}>",
      "register": "<register label in ${langLabel}>",
      "note": "<short note in ${langLabel} on when this alternative fits>"
    }
  ],
  "otherContexts": [
    {
      "contextLabel": "<short name of another situation where this same ${selectionKind} is used, in ${langLabel}>",
      "explanation": "<how it works in that other situation, strictly in ${langLabel}>",
      "example": "<natural example sentence strictly in ${langLabel}>"
    }
  ]
}
Guidance for arrays:
- wordBreakdown: include each meaningful word from the selection in order (even for a single word, include at least 1 entry describing its base form, grammatical category, and dictionary meaning).
- otherWaysToSay: provide 2 to 3 natural, learner-safe alternatives suited for real-world usage.
- otherContexts: provide 1 to 3 genuinely distinct situations where this same word or expression is used (for example figurative complaint vs. extreme improbability, or literal vs. idiomatic use).`;

    const readingExcerpt = params.readingContent?.trim()
      ? params.readingContent.trim().slice(0, 3500)
      : '';
    const contextSection = params.context?.trim()
      ? `\nSURROUNDING EXCERPT:\n"${params.context.trim()}"`
      : '';
    const readingSection = readingExcerpt
      ? `\nFULL READING CONTEXT${params.readingTitle ? ` ("${params.readingTitle.trim()}")` : ''}:\n"""\n${readingExcerpt}\n"""`
      : '';

    const userPrompt = `Explain the ${langLabel} ${selectionKind} "${params.word}" for a ${normalizedLevel} learner.${contextSection}${readingSection}

Give the word-by-word dictionary breakdown, contrast the literal sense with what it means inside this reading, share natural alternatives in ${langLabel}, and show other distinct contexts with real example sentences.`;

    return { systemPrompt, userPrompt };
  }

  /** Genera una semilla única trazable para identificar cada ejecución en bitácoras. */
  private generateSeed(params: RandomPromptParams): string {
    const parts: string[] = [];
    parts.push(params.category.slice(0, 4));
    parts.push(params.size.slice(0, 3));
    parts.push(params.difficulty.slice(0, 3));
    parts.push(params.contentType.split('_')[0].slice(0, 4));
    parts.push(Date.now().toString());
    parts.push(`${Math.floor(Math.random() * 1e6)}`);
    return parts.join('_');
  }
}

/** Unifica resúmenes recientes y títulos heredados para alimentar la detección de repetición. */
function normalizeRecentEntries(
  recentReadings: readonly RecentReadingSummary[] | undefined,
  recentTitles: readonly string[] | undefined,
  limit: number,
): RecentReadingSummary[] {
  if (recentReadings && recentReadings.length > 0) {
    return recentReadings
      .slice(0, limit)
      .map((entry) => ({
        title: entry.title.trim(),
        description: entry.description.trim(),
      }))
      .filter((entry) => entry.title.length > 0);
  }
  return (recentTitles ?? [])
    .slice(0, limit)
    .map((title) => ({ title: title.trim(), description: '' }))
    .filter((entry) => entry.title.length > 0);
}
