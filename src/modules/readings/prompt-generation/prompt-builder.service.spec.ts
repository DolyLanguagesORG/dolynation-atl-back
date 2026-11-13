import { PromptBuilderService } from './prompt-builder.service';
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

    it('limits anti-repetition list to at most 20 titles', () => {
      const manyTitles = Array.from({ length: 30 }, (_, i) => `Title ${i + 1}`);
      const { userPrompt } = service.buildEnrichmentPrompt({
        category: 'technology',
        difficulty: 'medium',
        recentTitles: manyTitles,
      });

      expect(userPrompt).toContain('Title 20');
      expect(userPrompt).not.toContain('Title 21');
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
  });
});
