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
const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  it: 'Italian',
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
You are an expert educational content curator and curriculum designer.
Your task is to brainstorm an engaging, highly specific, and non-cliché topic angle for a language learning reading exercise.

CRITICAL: You must respond ONLY with a valid JSON object in this exact format:
{
  "subtopic": "A specific, intriguing subtopic title (max 80 chars)",
  "perspective": "The analytical lens or viewpoint to explore (e.g., historical accident, paradox, societal impact)",
  "uniqueFocusElement": "A single compelling core question, surprising fact, or hook to explore",
  "keyConcepts": ["3 to 4 specific concepts, facts, or vocabulary ideas that MUST be included"]
}

No markdown outside the JSON, no explanations. ONLY the JSON object.
    `.trim();

    const antiRepetitionSection =
      recent.length > 0
        ? `ANTI-REPETITION CONSTRAINT (MANDATORY):
The student has ALREADY recently completed readings on these specific topics in this category:
${recent.map((t) => `- "${t}"`).join('\n')}

DO NOT repeat or closely mirror any of the above topics. Propose an entirely DIFFERENT subtopic or unexplored facet of "${categoryConfig.name}".`
        : `Choose an original, non-cliché angle within "${categoryConfig.name}".`;

    const userPrompt = `
Brainstorm a fresh, high-interest educational topic for a ${langLabel} reading text.

CATEGORY: "${categoryConfig.name}"
TARGET LEVEL: ${difficulty.description}

${antiRepetitionSection}

CREATIVE INSPIRATION:
- Suggested lens/angle: ${creativeAngle}
- Avoid broad generic overviews. Focus on a concrete, tangible story, phenomenon, or real-world application.
    `.trim();

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
    const categoryInstruction = category ? `"${category}"` : READING_CATEGORIES.join(' | ');
    const langLabel = LANGUAGE_NAMES[language?.toLowerCase() ?? 'en'] ?? 'English';

    return `
You are an educational content generator for language learners.
Your task is to generate neutral, informative reading texts in ${langLabel}.
The text must be expository, not narrative.
Do not create stories or characters.
Do not use personal names or personal experiences.
Do not mention that you are an AI.

IMPORTANT: You must respond ONLY with a valid JSON object in this exact format:
{
  "title": "A short, engaging title for the text (max 100 characters)",
  "description": "A brief 1-2 sentence summary of what the text is about",
  "content": "The full reading text",
  "category": "${categoryInstruction}",
  "difficulty": "easy | medium | hard"
}

No additional text, no markdown, no explanations. ONLY the JSON object.
    `.trim();
  }

  /**
   * Prompt de usuario que define tema, longitud, nivel y estilo de redacción para el LLM.
   */
  private buildUserPrompt(params: RandomPromptParams): string {
    const categoryConfig = getCategoryConfig(params.category);
    const difficulty = DIFFICULTY_LEVELS[params.difficulty];
    const textSize = TEXT_SIZES[params.size];
    const contentTypeDesc = CONTENT_TYPE_DESCRIPTIONS[params.contentType];
    const perspectiveDesc = PERSPECTIVE_DESCRIPTIONS[params.perspective];
    const langLabel = LANGUAGE_NAMES[params.language?.toLowerCase() ?? 'en'] ?? 'English';
    const keyConceptsLine =
      params.keyConcepts && params.keyConcepts.length > 0
        ? `- Key concepts to weave in: ${params.keyConcepts.join(', ')}\n`
        : '';

    return `
Generate a reading text in ${langLabel} with the following specific constraints:

TOPIC REQUIREMENTS:
- Primary topic: ${categoryConfig.name}, focusing on ${params.subcategories.join(' and ')}
- Content type: Write about ${contentTypeDesc}
- Perspective: Focus on ${perspectiveDesc}
- Unique angle: Explore ${params.uniqueFocusElement}
${keyConceptsLine}
TEXT SPECIFICATIONS:
- Length: ${textSize.min}-${textSize.max} words (${textSize.label} length)
- Approximate reading time: ${textSize.readingTime}
- Style: Informative and explanatory, like a short article
- Tone: Neutral and engaging

LANGUAGE LEVEL REQUIREMENTS (CRITICAL - THIS IS THE DIFFICULTY):
- Target level: ${difficulty.description}
- The output "difficulty" field MUST be "${difficulty.id}"
- VOCABULARY: ${difficulty.vocabularyGuidelines}
- GRAMMAR: ${difficulty.grammarGuidelines}

STRICT RULES:
- Do NOT tell a story or create characters
- Do NOT use personal names or experiences
- Do NOT write in first-person narrative
- Do NOT use bullet points or numbered lists in the content
- Output ONLY the JSON object as specified
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
