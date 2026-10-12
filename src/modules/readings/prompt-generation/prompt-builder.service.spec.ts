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
});
