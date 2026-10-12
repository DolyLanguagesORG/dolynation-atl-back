import { Injectable } from '@nestjs/common';
import {
  CATEGORIES,
  CONTENT_TYPE_DESCRIPTIONS,
  DIFFICULTY_LEVELS,
  PERSPECTIVE_DESCRIPTIONS,
  READING_CATEGORIES,
  READING_DIFFICULTIES,
  READING_TEXT_SIZES,
  TEXT_SIZES,
  UNIQUE_FOCUS_BY_CATEGORY,
} from './catalog.constants';
import { getCategoryConfig, pickRandom, resolveCefrLevel } from './catalog.helpers';
import type {
  CategoryConfig,
  CefrLevel,
  DifficultyLevel,
  GeneratedPrompt,
  RandomPromptParams,
  TextSizeConfig,
} from './catalog.types';

@Injectable()
export class PromptBuilderService {
  /**
   * Builds the full prompt that goes to the LLM.
   *
   * The userPrompt is the critical piece: it tells the LLM exactly which
   * vocabulary level and grammar structures to use (so a learner on
   * `easy` doesn't get a wall of C1 vocabulary), plus the word count range
   * (so a `short` reading is short and a `long` one is genuinely long).
   *
   * The systemPrompt sets the JSON output contract — the LLM MUST echo
   * the requested `difficulty` so the database stays in sync with what
   * the user asked for, even if the AI would have chosen otherwise.
   */
  buildPrompt(params: RandomPromptParams): GeneratedPrompt {
    return {
      systemPrompt: this.buildSystemPrompt(),
      userPrompt: this.buildUserPrompt(params),
      params,
      seed: this.generateSeed(params),
    };
  }

  /**
   * Generates a random-but-valid params object. Used as a fallback when
   * the request body is missing one or more categorical fields. The caller
   * should pass what the user provided and only fall back to this when
   * missing.
   */
  generateRandomParams(partial?: Partial<RandomPromptParams>): RandomPromptParams {
    const category = partial?.category ?? pickRandom(READING_CATEGORIES);
    const difficulty = partial?.difficulty ?? pickRandom(READING_DIFFICULTIES);
    const size = partial?.size ?? pickRandom(READING_TEXT_SIZES);
    const categoryConfig = getCategoryConfig(category);
    const subcategories = (partial?.subcategories ?? []).length
      ? (partial?.subcategories ?? [])
      : [pickRandom(categoryConfig.subcategories).name];

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
      uniqueFocusElement:
        partial?.uniqueFocusElement ?? pickRandom(UNIQUE_FOCUS_BY_CATEGORY[category]),
    };
  }

  /**
   * Returns the cefrLevel that should be persisted alongside the reading.
   * The public DTO no longer exposes this — the service pins the level
   * here so the user can't pick an inconsistent pairing.
   */
  resolveCefrLevelFor(difficulty: DifficultyLevel): CefrLevel {
    return resolveCefrLevel(difficulty);
  }

  /** Returns the static categories config (used by /readings/options). */
  getAvailableCategories(): CategoryConfig[] {
    return Array.from(CATEGORIES);
  }

  /** Returns the static sizes config (used by /readings/options). */
  getAvailableSizes(): TextSizeConfig[] {
    return Object.values(TEXT_SIZES);
  }

  /**
   * Builds the JSON-only system prompt that locks down the output format
   * and tells the LLM what kind of content is unacceptable (stories,
   * characters, first-person voice).
   */
  private buildSystemPrompt(): string {
    return `
You are an English content generator for language learners.
Your task is to generate neutral, informative reading texts in English.
The text must be expository, not narrative.
Do not create stories or characters.
Do not use personal names or personal experiences.
Do not mention that you are an AI.

IMPORTANT: You must respond ONLY with a valid JSON object in this exact format:
{
  "title": "A short, engaging title for the text (max 100 characters)",
  "description": "A brief 1-2 sentence summary of what the text is about",
  "content": "The full reading text",
  "category": "${READING_CATEGORIES.join(' | ')}",
  "difficulty": "easy | medium | hard"
}

No additional text, no markdown, no explanations. ONLY the JSON object.
    `.trim();
  }

  /**
   * The user prompt that drives the LLM's writing style. This is the
   * part that changed in this commit: instead of a flat "easy reading
   * about Technology", it now injects explicit vocabulary and grammar
   * guidelines that match the chosen difficulty and a word count range
   * that matches the chosen size.
   */
  private buildUserPrompt(params: RandomPromptParams): string {
    const categoryConfig = getCategoryConfig(params.category);
    const difficulty = DIFFICULTY_LEVELS[params.difficulty];
    const textSize = TEXT_SIZES[params.size];
    const contentTypeDesc = CONTENT_TYPE_DESCRIPTIONS[params.contentType];
    const perspectiveDesc = PERSPECTIVE_DESCRIPTIONS[params.perspective];

    return `
Generate a reading text in English with the following specific constraints:

TOPIC REQUIREMENTS:
- Primary topic: ${categoryConfig.name}, focusing on ${params.subcategories.join(' and ')}
- Content type: Write about ${contentTypeDesc}
- Perspective: Focus on ${perspectiveDesc}
- Unique angle: Explore ${params.uniqueFocusElement}

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
