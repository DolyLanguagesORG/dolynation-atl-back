import { Injectable } from '@nestjs/common';
import {
  CATEGORIES,
  CONTENT_TYPE_DESCRIPTIONS,
  CREATIVE_PERSPECTIVE_ANGLES,
  DIFFICULTY_LEVELS,
  PERSPECTIVE_DESCRIPTIONS,
  READING_CATEGORIES,
  READING_DIFFICULTIES,
  READING_TEXT_SIZES,
  TEXT_SIZES,
} from './catalog.constants';
import {
  getCategoryConfig,
  getUniqueFocusForCategory,
  pickRandom,
  resolveCefrLevel,
} from './catalog.helpers';
import type {
  CategoryConfig,
  CefrLevel,
  DifficultyLevel,
  EnrichedTopic,
  EnrichmentPromptParams,
  GeneratedPrompt,
  RandomPromptParams,
  TextSizeConfig,
} from './catalog.types';

/** Nombres de idioma legibles inyectados en las instrucciones de los prompts al LLM. */
export const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  it: 'Italian',
};

/** Guías lingüísticas y pedagógicas por idioma objetivo para sostener coherencia y registro CEFR. */
const LANGUAGE_STYLE_GUIDES: Record<string, string> = {
  es:
    'Write naturally in neutral international Spanish. Keep orthography and accents impeccable. ' +
    'For easy (A1-A2), use present, preterite/imperfect basics and simple connectors (primero, además, por eso); ' +
    'for medium (B1-B2), integrate compound tenses, passive se, and clear transitions (sin embargo, por lo tanto); ' +
    'for hard (C1-C2), employ nuanced subjunctive, precise nominalizations, and domain-specific idioms.',
  en:
    'Write naturally in clear standard English. ' +
    'For easy (A1-A2), rely on high-frequency vocabulary and crisp SVO sentences; ' +
    'for medium (B1-B2), combine phrasal verbs, relative clauses, conditionals, and transitional markers (however, moreover); ' +
    'for hard (C1-C2), deploy academic collocations, inversion, cleft clauses, and nuanced domain terminology.',
  fr:
    'Write naturally in authentic standard French (respect accents, elisions, and agreement). ' +
    'For easy (A1-A2), use présent, passé composé, futur proche and concrete everyday vocabulary; ' +
    'for medium (B1-B2), weave imparfait/conditionnel, pronoms relatifs, and logical markers (cependant, en effet, ainsi); ' +
    'for hard (C1-C2), apply subjonctif, nominal structures, idiomatic expressions, and authentic French technical terms.',
  it:
    'Write naturally in idiomatic standard Italian (respect accents, articles, and verb agreement). ' +
    'For easy (A1-A2), use presente, passato prossimo and concrete high-frequency words; ' +
    'for medium (B1-B2), combine imperfetto, condizionale, combined pronouns, and connectors (tuttavia, quindi, inoltre); ' +
    'for hard (C1-C2), use congiuntivo, passive/impersonal si forms, essay-style register, and rich specialized vocabulary.',
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
    const creativeAngle = params.randomAngle ?? pickRandom(CREATIVE_PERSPECTIVE_ANGLES);
    const recent = (params.recentTitles ?? []).slice(0, 20);
    const langLabel = LANGUAGE_NAMES[params.language?.toLowerCase() ?? 'en'] ?? 'English';

    const systemPrompt = `
You curate reading topic ideas for ${langLabel} learners (${difficulty.description}).
Respond ONLY with a valid JSON object (no markdown fences, no commentary):
{
  "subtopic": "<specific, concrete subtopic title strictly in ${langLabel}>",
  "perspective": "<brief analytical angle strictly in ${langLabel}>",
  "uniqueFocusElement": "<one compelling core question or interesting insight strictly in ${langLabel}>",
  "keyConcepts": ["3 to 5 useful domain vocabulary terms strictly in ${langLabel} appropriate for ${difficulty.label} learners"]
}
Be concise, pick one concrete angle quickly, and keep all JSON string values in natural ${langLabel}.
    `.trim();

    const antiRepetitionSection =
      recent.length > 0
        ? `ANTI-REPETITION CONSTRAINT: Do NOT repeat or imitate these recent titles:\n${recent.map((t) => `- "${t}"`).join('\n')}`
        : `Avoid generic textbook overviews; focus on a concrete phenomenon or application.`;

    const userPrompt =
      `Topic/Category: "${params.category}" (${categoryConfig.name}) | Target language: ${langLabel} | Level: ${difficulty.description} | Lens: ${creativeAngle}
${antiRepetitionSection}
Suggest one authentic facet of "${params.category}" and 3-5 useful ${langLabel} domain vocabulary terms aligned with ${difficulty.label}.`.trim();

    const seed = `enrich_${params.category.slice(0, 4)}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;

    return { systemPrompt, userPrompt, seed };
  }

  /**
   * Parsea de forma segura la salida del prompt intermedio de enriquecimiento en un `EnrichedTopic`.
   * Si falla el análisis JSON o faltan campos, devuelve el respaldo sin interrumpir el flujo.
   */
  parseEnrichmentResponse(raw: string, fallback: EnrichedTopic): EnrichedTopic {
    try {
      const cleaned = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

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
    const category = partial?.category ?? pickRandom(READING_CATEGORIES);
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
      avoidTopics: partial?.avoidTopics,
      ...(partial?.language !== undefined ? { language: partial.language } : {}),
    };
  }

  /**
   * Devuelve el nivel CEFR que corresponde persistir junto con la lectura.
   */
  resolveCefrLevelFor(difficulty: DifficultyLevel): CefrLevel {
    return resolveCefrLevel(difficulty);
  }

  /** Devuelve la configuración estática de categorías (usada por `/readings/options`). */
  getAvailableCategories(): CategoryConfig[] {
    return Array.from(CATEGORIES);
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
    const categoryInstruction = category ?? READING_CATEGORIES.join(' | ');
    const langLabel = LANGUAGE_NAMES[language?.toLowerCase() ?? 'en'] ?? 'English';

    return `
You are an educational expository writer for ${langLabel} learners. Write an informative, logically structured article strictly in ${langLabel} (do not create stories, characters, personal names, anecdotes, or first-person narrative).

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
    const langGuide = LANGUAGE_STYLE_GUIDES[normalizedLang] ?? LANGUAGE_STYLE_GUIDES['en'];
    const subtopicLine =
      params.subcategories.length === 1 &&
      params.subcategories[0]?.trim().toLowerCase() === categoryConfig.name.trim().toLowerCase()
        ? `- Primary topic & dynamic category: ${categoryConfig.name}`
        : `- Primary topic: ${categoryConfig.name}, focusing on ${params.subcategories.join(' and ')}`;
    const keyConceptsLine =
      params.keyConcepts && params.keyConcepts.length > 0
        ? `- Key concepts to weave in: ${params.keyConcepts.join(', ')}\n`
        : '';
    const avoidTopicsSection =
      params.avoidTopics && params.avoidTopics.length > 0
        ? `\nAVOID REPETITION:\n- Do NOT reuse or closely imitate these recent titles/angles: ${params.avoidTopics
            .slice(0, 15)
            .map((t) => `"${t}"`)
            .join(', ')}\n`
        : '';

    return `
Write an informative reading article in ${langLabel}:

TOPIC & VOCABULARY:
${subtopicLine} (category: "${params.category}")
- Content type: ${contentTypeDesc} | Perspective: ${perspectiveDesc}
- Unique angle: ${params.uniqueFocusElement}
${keyConceptsLine}- Illustrate practical ${langLabel} vocabulary for "${categoryConfig.name}" naturally in context.
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
