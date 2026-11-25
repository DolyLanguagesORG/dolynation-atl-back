import {
  LANGUAGE_PROMPT_TEMPLATES,
  PROMPT_TEMPLATE_VERSION,
  PromptBuilderService,
  pickExplorationLens,
} from './index';
import type {
  DifficultyLevel,
  GeneratedPrompt,
  RandomPromptParams,
  TextSize,
} from './catalog.types';

/**
 * Tests for the prompt-generation service. These are the *most important*
 * tests in the readings module: they pin the contract that the LLM sees.
 *
 * The previous version of this service was effectively a stub — the user
 * prompt was a flat 4-line template that didn't change with the chosen
 * `difficulty`, so the LLM was writing at roughly the same level no matter
 * what the user picked. The current contract injects per-difficulty
 * vocabulary and grammar guidelines plus the text length in words. These
 * tests pin the regenerated contract.
 */
describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

  beforeEach(() => {
    service = new PromptBuilderService();
  });

  /**
   * Builds a prompt using the simpler trio the client actually sends:
   * (category, difficulty, size). The service derives cefrLevel internally
   * so the public DTO only needs to expose what the user picks.
   */
  const build = (
    category: RandomPromptParams['category'],
    difficulty: DifficultyLevel,
    size: TextSize,
  ): GeneratedPrompt =>
    service.buildPrompt({
      category,
      difficulty,
      size,
      subcategories: ['Subcategory test'],
      contentType: 'interesting_discovery',
      perspective: 'causes',
      uniqueFocusElement: 'its impact on daily life',
    });

  describe('buildPrompt vocabulary guidelines', () => {
    it('prompts the LLM for elementary-level vocabulary on easy', () => {
      const { userPrompt } = build('technology', 'easy', 'medium');
      expect(userPrompt).toMatch(/A1[- ]?A2/i);
      // The vocabulary guideline for easy explicitly limits the word pool.
      expect(userPrompt.toLowerCase()).toContain('basic');
    });

    it('prompts the LLM for intermediate vocabulary on medium', () => {
      const { userPrompt } = build('history', 'medium', 'medium');
      expect(userPrompt).toMatch(/B1[- ]?B2/i);
      expect(userPrompt.toLowerCase()).toContain('intermediate');
    });

    it('prompts the LLM for advanced/sophisticated vocabulary on hard', () => {
      const { userPrompt } = build('culture', 'hard', 'medium');
      expect(userPrompt).toMatch(/C1[- ]?C2/i);
      // The hard guideline talks about sophisticated / specialised vocabulary.
      expect(userPrompt.toLowerCase()).toMatch(/sophisticated|specialized/);
    });

    it('the three difficulty prompts are textually distinct (no copy-paste)', () => {
      const easy = build('history', 'easy', 'medium').userPrompt;
      const medium = build('history', 'medium', 'medium').userPrompt;
      const hard = build('history', 'hard', 'medium').userPrompt;
      expect(easy).not.toBe(medium);
      expect(medium).not.toBe(hard);
      expect(easy).not.toBe(hard);
    });
  });

  describe('buildPrompt grammar guidelines', () => {
    it('asks for short, simple sentences on easy', () => {
      const { userPrompt } = build('programming', 'easy', 'short');
      // easy grammar guideline restricts to simple tenses + short sentences.
      expect(userPrompt.toLowerCase()).toMatch(/simple (present|past|future)|short sentences/);
      expect(userPrompt.toLowerCase()).toContain('avoid');
    });

    it('allows perfect tenses, conditionals, passive voice on medium', () => {
      const { userPrompt } = build('programming', 'medium', 'short');
      expect(userPrompt.toLowerCase()).toMatch(/perfect|conditional|passive/);
    });

    it('asks for mixed conditionals, subjunctive, inversion on hard', () => {
      const { userPrompt } = build('programming', 'hard', 'short');
      expect(userPrompt.toLowerCase()).toMatch(/conditional|subjunctive|inversion/);
    });
  });

  describe('buildPrompt size handling', () => {
    it('emits a 80–120 word target for short readings', () => {
      const { userPrompt } = build('history', 'medium', 'short');
      expect(userPrompt).toContain('80-120 words');
      expect(userPrompt).toContain('short length');
    });

    it('emits a 150–220 word target for medium readings', () => {
      const { userPrompt } = build('history', 'medium', 'medium');
      expect(userPrompt).toContain('150-220 words');
      expect(userPrompt).toContain('medium length');
    });

    it('emits a 250–350 word target for long readings', () => {
      const { userPrompt } = build('history', 'medium', 'long');
      expect(userPrompt).toContain('250-350 words');
      expect(userPrompt).toContain('long length');
    });

    it('reads aloud the word range AND a human reading time', () => {
      const { userPrompt } = build('history', 'easy', 'short');
      // short → "~1 min"
      expect(userPrompt).toContain('~1 min');
    });
  });

  describe('buildPrompt topic and focus', () => {
    it('includes the category label and a selected subcategory', () => {
      const { userPrompt } = build('technology', 'easy', 'medium');
      expect(userPrompt).toContain('Technology');
      expect(userPrompt).toContain('Subcategory test');
    });

    it('includes the chosen content type and perspective', () => {
      const { userPrompt } = build('history', 'medium', 'medium');
      expect(userPrompt.toLowerCase()).toContain('interesting discovery');
      expect(userPrompt.toLowerCase()).toContain('causes');
    });

    it('includes the chosen unique focus angle', () => {
      const { userPrompt } = build('programming', 'medium', 'medium');
      // We forced uniqueFocusElement to "its impact on daily life"
      expect(userPrompt.toLowerCase()).toContain('impact on daily life');
    });

    it('forces the LLM to set the right difficulty in the output JSON', () => {
      const { userPrompt } = build('history', 'hard', 'medium');
      expect(userPrompt).toContain('"hard"');
      expect(userPrompt).toMatch(/MUST be "hard"/i);
    });
  });

  describe('system prompt', () => {
    it('requires the LLM to return ONLY a JSON object', () => {
      const { systemPrompt } = build('history', 'medium', 'medium');
      expect(systemPrompt).toContain('JSON');
      expect(systemPrompt).toMatch(/ONLY.*JSON/i);
      expect(systemPrompt).toContain('"category"');
      expect(systemPrompt).toContain('"difficulty"');
      expect(systemPrompt).toContain('"title"');
      expect(systemPrompt).toContain('"content"');
    });

    it('forbids stories, characters, first-person narrative', () => {
      const { systemPrompt } = build('history', 'medium', 'medium');
      expect(systemPrompt.toLowerCase()).toContain('expository');
      expect(systemPrompt.toLowerCase()).toContain('do not create stories');
      expect(systemPrompt.toLowerCase()).toMatch(/first[- ]person|narrative/);
      // The LLM is told not to write in first-person voice either.
      expect(systemPrompt.toLowerCase()).toMatch(/personal names|anecdotes/);
    });
  });

  describe('seed generation', () => {
    it('emits a unique seed each call', () => {
      const a = build('history', 'medium', 'medium').seed;
      const b = build('history', 'medium', 'medium').seed;
      expect(a).not.toBe(b);
    });
  });

  describe('intermediate enrichment prompt (Step 1)', () => {
    it('builds an enrichment prompt with anti-repetition rules when recent titles exist', () => {
      const { systemPrompt, userPrompt, seed } = service.buildEnrichmentPrompt({
        category: 'technology',
        difficulty: 'medium',
        recentTitles: ['Smartphones Evolution', 'Social Media Algorithms'],
        randomAngle: 'an unexpected mistake that led to a discovery',
      });

      expect(systemPrompt).toContain('subtopic');
      expect(systemPrompt).toContain('uniqueFocusElement');
      expect(systemPrompt).toContain('keyConcepts');
      expect(userPrompt).toContain('Smartphones Evolution');
      expect(userPrompt).toContain('Social Media Algorithms');
      expect(userPrompt).toContain('ANTI-REPETITION CONSTRAINT');
      expect(userPrompt).toContain('an unexpected mistake that led to a discovery');
      expect(seed).toContain('enrich_');
    });

    it('limits anti-repetition list to at most 10 readings and includes descriptions when provided', () => {
      const manyReadings = Array.from({ length: 20 }, (_, i) => ({
        title: `Title ${i + 1}`,
        description: `Summary ${i + 1}`,
      }));
      const { userPrompt } = service.buildEnrichmentPrompt({
        category: 'Día de Muertos',
        difficulty: 'medium',
        recentReadings: manyReadings,
      });

      expect(userPrompt).toContain('Title 10');
      expect(userPrompt).toContain('Summary 10');
      expect(userPrompt).not.toContain('Title 11');
    });

    it('includes excluded angles and anti-cliché rules during enrichment and final prompt construction', () => {
      const { systemPrompt, userPrompt } = service.buildEnrichmentPrompt({
        category: 'Filosofía',
        difficulty: 'hard',
        language: 'es',
        recentReadings: [
          {
            title: '¿Qué es la filosofía?',
            description: 'Explicación general sobre el amor a la sabiduría.',
          },
        ],
        excludedAngles: ['"Origen griego" — Historia básica de la filosofía'],
      });

      expect(systemPrompt).toContain('NEVER propose a generic "What is X" definition');
      expect(userPrompt).toContain('Explicación general sobre el amor a la sabiduría.');
      expect(userPrompt).toContain('REJECTED SIMILAR ANGLES');
      expect(userPrompt).toContain('"Origen griego"');

      const finalPrompt = service.buildPrompt({
        category: 'Filosofía',
        difficulty: 'hard',
        size: 'medium',
        language: 'es',
        subcategories: ['La alegoría de la caverna de Platón'],
        contentType: 'comparison',
        perspective: 'effects',
        uniqueFocusElement: 'cómo Platón cuestiona las apariencias en la política moderna',
        recentReadings: [
          {
            title: '¿Qué es la filosofía?',
            description: 'Explicación general sobre el amor a la sabiduría.',
          },
        ],
      });

      expect(finalPrompt.userPrompt).toContain('TOPICAL FOCUS & OPENING RULE');
      expect(finalPrompt.userPrompt).toContain('Explicación general sobre el amor a la sabiduría.');
      expect(finalPrompt.systemPrompt.toLowerCase()).toContain('conversational-informative');
    });

    it('pickExplorationLens avoids repeating foundational lenses when history already covers basics', () => {
      for (let i = 0; i < 20; i += 1) {
        const picked = pickExplorationLens([
          {
            title: 'Orígenes del Día de Muertos',
            description: 'Unión entre cultura indígena y católica.',
          },
        ]);
        expect(picked.id).not.toBe('fresh_foundational_angle');
      }
    });

    it('omits anti-repetition section if recent titles array is empty', () => {
      const { userPrompt } = service.buildEnrichmentPrompt({
        category: 'technology',
        difficulty: 'easy',
        recentTitles: [],
      });

      expect(userPrompt).not.toContain('ANTI-REPETITION CONSTRAINT');
    });
  });

  describe('parseEnrichmentResponse', () => {
    const fallback = {
      subtopic: 'Fallback Subtopic',
      perspective: 'causes',
      uniqueFocusElement: 'impact on society',
      keyConcepts: ['concept1'],
    };

    it('parses valid JSON response correctly', () => {
      const raw = JSON.stringify({
        subtopic: 'Quantum Cryptography',
        perspective: 'practical applications',
        uniqueFocusElement: 'how photon polarization prevents eavesdropping',
        keyConcepts: ['photons', 'Heisenberg uncertainty', 'no-cloning theorem'],
      });

      const result = service.parseEnrichmentResponse(raw, fallback);
      expect(result.subtopic).toBe('Quantum Cryptography');
      expect(result.perspective).toBe('practical applications');
      expect(result.uniqueFocusElement).toContain('photon polarization');
      expect(result.keyConcepts).toHaveLength(3);
    });

    it('handles markdown code fences and think blocks cleanly', () => {
      const raw = `
<think>Brainstorming quantum ideas...</think>
\`\`\`json
{
  "subtopic": "Deep Sea Hydrothermal Vents",
  "perspective": "evolutionary adaptation",
  "uniqueFocusElement": "chemosynthesis replacing photosynthesis",
  "keyConcepts": ["chemosynthesis", "extremophiles", "black smokers"]
}
\`\`\`
      `;

      const result = service.parseEnrichmentResponse(raw, fallback);
      expect(result.subtopic).toBe('Deep Sea Hydrothermal Vents');
      expect(result.keyConcepts).toContain('extremophiles');
    });

    it('returns fallback if JSON is invalid or missing required subtopic', () => {
      const invalid = 'Not valid json';
      expect(service.parseEnrichmentResponse(invalid, fallback)).toBe(fallback);

      const missingSubtopic = JSON.stringify({ perspective: 'causes' });
      expect(service.parseEnrichmentResponse(missingSubtopic, fallback)).toBe(fallback);
    });
  });

  describe('dynamic categories & key concepts', () => {
    it('supports arbitrary dynamic category strings without throwing', () => {
      const prompt = service.buildPrompt({
        category: 'quantum_entanglement',
        difficulty: 'hard',
        size: 'medium',
        subcategories: ['Bell Tests'],
        contentType: 'interesting_discovery',
        perspective: 'causes',
        uniqueFocusElement: 'loophole-free experimental tests',
        keyConcepts: ['spooky action', 'locality', 'detector efficiency'],
      });

      expect(prompt.userPrompt).toContain('Quantum Entanglement');
      expect(prompt.userPrompt).toContain('Bell Tests');
      expect(prompt.userPrompt).toContain('loophole-free experimental tests');
      expect(prompt.userPrompt).toContain(
        'Key concepts to weave in: spooky action, locality, detector efficiency',
      );
      expect(prompt.systemPrompt).toContain('"quantum_entanglement"');
    });

    it('buildFallbackEnrichedTopic returns valid topic for dynamic category', () => {
      const result = service.buildFallbackEnrichedTopic('renewable_energy', 'medium');
      expect(result.subtopic).toBeDefined();
      expect(result.perspective).toBeDefined();
      expect(result.uniqueFocusElement).toBeDefined();
      expect(Array.isArray(result.keyConcepts)).toBe(true);
    });

    it('preserves target language across generateRandomParams -> buildPrompt for all 4 languages', () => {
      const expectedLabels = {
        es: 'Spanish',
        en: 'English',
        fr: 'French',
        it: 'Italian',
      } as const;

      for (const [lang, label] of Object.entries(expectedLabels)) {
        const params = service.generateRandomParams({
          category: 'gastronomia_molecular',
          difficulty: 'medium',
          size: 'medium',
          language: lang,
          subcategories: ['Esferificación'],
          keyConcepts: ['emulsión', 'textura'],
          avoidTopics: ['Cocina Tradicional'],
        });

        expect(params.language).toBe(lang);

        const built = service.buildPrompt(params);
        expect(built.systemPrompt).toContain(`strictly in ${label}`);
        expect(built.userPrompt).toContain(
          `Write 100% of "title", "description", and "content" in ${label}`,
        );
        expect(built.userPrompt).toContain('STRUCTURE & COHERENCE REQUIREMENTS');
        expect(built.userPrompt).toContain('AVOID REPETITION');
        expect(built.userPrompt).toContain('Cocina Tradicional');
      }
    });

    it('isolates CEFR style guides per difficulty level without leaking higher-tier instructions into easy prompts', () => {
      const easyFr = service.buildPrompt(
        service.buildParamsFromBlueprint({
          category: 'Gastronomía Francesa',
          difficulty: 'easy',
          size: 'short',
          language: 'fr',
          blueprint: null,
          recentTitles: ['French Bread Traditions in Lyon'],
        }),
      );

      expect(easyFr.userPrompt).toContain('A1-A2 level');
      expect(easyFr.userPrompt).toContain('passé composé');
      expect(easyFr.userPrompt).not.toContain('subjonctif');
      expect(easyFr.userPrompt).toContain('Gastronomía Francesa');
    });

    it('uses custom CategoryPromptProfile blueprints and avoids repeating recent titles in TypeScript', () => {
      const params = service.buildParamsFromBlueprint({
        category: 'Día de Muertos',
        difficulty: 'medium',
        size: 'medium',
        language: 'es',
        blueprint: {
          displayName: 'Día de Muertos',
          editorialGuidance: 'Explain cultural symbolism of altars and regional traditions.',
          subtopics: ['Marigold Petals Symbolism', 'Sugar Skulls Craftsmanship'],
          uniqueFocusAngles: ['how altars preserve family memory'],
          coreConcepts: ['cempasúchil', 'ofrenda', 'calaverita'],
          generatedAt: '2026-11-14T00:00:00.000Z',
        },
        recentTitles: ['Sugar Skulls Craftsmanship Across Regions'],
      });

      expect(params.subcategories).toEqual(['Marigold Petals Symbolism']);
      expect(params.editorialGuidance).toContain('altars');
      expect(params.avoidTopics).toEqual(['Sugar Skulls Craftsmanship Across Regions']);
    });
  });

  describe('buildExplanationPrompt', () => {
    it('adapts instructions exclusively to the reading language and learner difficulty', () => {
      const easyEs = service.buildExplanationPrompt({
        word: 'que me parta un rayo',
        entryType: 'phrase',
        language: 'es',
        difficulty: 'easy',
        readingTitle: 'Un día complicado',
        readingContent: 'Juan perdió su tren y dijo que me parta un rayo.',
        context: 'dijo que me parta un rayo',
      });
      expect(easyEs.systemPrompt).toContain('Spanish vocabulary explainer');
      expect(easyEs.systemPrompt).toContain('Beginner (A1-A2)');
      expect(easyEs.systemPrompt).toContain('wordBreakdown');
      expect(easyEs.systemPrompt).toContain('otherWaysToSay');
      expect(easyEs.systemPrompt).toContain('otherContexts');
      expect(easyEs.userPrompt).toContain('Un día complicado');

      const hardIt = service.buildExplanationPrompt({
        word: 'malgrado',
        entryType: 'word',
        language: 'it',
        difficulty: 'hard',
      });
      expect(hardIt.systemPrompt).toContain('Italian vocabulary explainer');
      expect(hardIt.systemPrompt).toContain('Advanced / Native-like (C1-C2)');
    });
  });

  describe('versioned language templates and reproducible seed (back#20)', () => {
    it('defines isolated versioned templates for all 4 supported languages and exposes templateVersion', () => {
      const langs = ['es', 'en', 'fr', 'it'] as const;
      const prompts = langs.map((language) => {
        expect(LANGUAGE_PROMPT_TEMPLATES[language]).toBeDefined();
        expect(LANGUAGE_PROMPT_TEMPLATES[language].version).toBe(PROMPT_TEMPLATE_VERSION);
        const params = service.generateRandomParams({
          category: 'astronomy',
          difficulty: 'medium',
          size: 'medium',
          language,
          seed: 'fixed-lang-seed',
        });
        return service.buildPrompt(params);
      });

      prompts.forEach((prompt, idx) => {
        const lang = langs[idx];
        expect(prompt.templateVersion).toBe(`${lang}@${PROMPT_TEMPLATE_VERSION}`);
        expect(prompt.systemPrompt).toContain('Respond ONLY with a valid JSON object');
      });

      const uniqueSystemPrompts = new Set(prompts.map((p) => p.systemPrompt));
      const uniqueUserPrompts = new Set(prompts.map((p) => p.userPrompt));
      expect(uniqueSystemPrompts.size).toBe(4);
      expect(uniqueUserPrompts.size).toBe(4);
    });

    it('produces distinct verifiable prompts when category, difficulty or size change', () => {
      const base = service.buildPrompt(
        service.generateRandomParams({
          category: 'architecture',
          difficulty: 'easy',
          size: 'short',
          language: 'es',
          seed: 'diff-check',
        }),
      );
      const diffCategory = service.buildPrompt(
        service.generateRandomParams({
          category: 'oceanography',
          difficulty: 'easy',
          size: 'short',
          language: 'es',
          seed: 'diff-check',
        }),
      );
      const diffDifficulty = service.buildPrompt(
        service.generateRandomParams({
          category: 'architecture',
          difficulty: 'hard',
          size: 'short',
          language: 'es',
          seed: 'diff-check',
        }),
      );
      const diffSize = service.buildPrompt(
        service.generateRandomParams({
          category: 'architecture',
          difficulty: 'easy',
          size: 'long',
          language: 'es',
          seed: 'diff-check',
        }),
      );

      expect(base.userPrompt).not.toBe(diffCategory.userPrompt);
      expect(base.userPrompt).not.toBe(diffDifficulty.userPrompt);
      expect(base.userPrompt).not.toBe(diffSize.userPrompt);
    });

    it('produces identical params and prompt for the same input + seed, and varies when seed changes', () => {
      const firstParams = service.generateRandomParams({
        category: 'cinema',
        language: 'it',
        seed: 'repro-seed-42',
      });
      const secondParams = service.generateRandomParams({
        category: 'cinema',
        language: 'it',
        seed: 'repro-seed-42',
      });

      expect(firstParams).toEqual(secondParams);

      const firstPrompt = service.buildPrompt(firstParams);
      const secondPrompt = service.buildPrompt(secondParams);
      expect(firstPrompt).toEqual(secondPrompt);
      expect(firstPrompt.seed).toBe('repro-seed-42');
      expect(firstPrompt.templateVersion).toBe(`it@${PROMPT_TEMPLATE_VERSION}`);

      const variedPrompts = ['alpha-1', 'beta-2', 'gamma-3', 'delta-4'].map((seed) =>
        service.buildPrompt(
          service.generateRandomParams({
            category: 'cinema',
            language: 'it',
            seed,
          }),
        ),
      );
      expect(new Set(variedPrompts.map((p) => p.userPrompt)).size).toBeGreaterThan(1);
    });

    it('covers all 4 languages across all 3 difficulty levels with JSON format enforcement', () => {
      const langs = ['es', 'en', 'fr', 'it'] as const;
      const difficulties: DifficultyLevel[] = ['easy', 'medium', 'hard'];

      for (const language of langs) {
        for (const difficulty of difficulties) {
          const params = service.generateRandomParams({
            category: 'renewable_energy',
            difficulty,
            size: 'medium',
            language,
            seed: `${language}-${difficulty}`,
          });
          const built = service.buildPrompt(params);
          expect(built.templateVersion).toBe(`${language}@${PROMPT_TEMPLATE_VERSION}`);
          expect(built.systemPrompt).toContain(
            `strictly in ${LANGUAGE_PROMPT_TEMPLATES[language].languageName}`,
          );
          expect(built.systemPrompt).toContain('"title"');
          expect(built.systemPrompt).toContain('"description"');
          expect(built.systemPrompt).toContain('"content"');
          expect(built.userPrompt).toContain(`MUST be "${difficulty}"`);
        }
      }
    });
  });
});
