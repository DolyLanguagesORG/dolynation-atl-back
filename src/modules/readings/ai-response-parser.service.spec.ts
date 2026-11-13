import { AiResponseParserService } from './ai-response-parser.service';

describe('AiResponseParserService', () => {
  let parser: AiResponseParserService;

  beforeEach(() => {
    parser = new AiResponseParserService();
  });

  describe('parseGeneratedText', () => {
    it('extracts JSON wrapped in ```json fences', () => {
      const raw =
        '```json\n{"title":"Cats","description":"About cats","content":"Cats are great","category":"technology","difficulty":"easy"}\n```';
      const result = parser.parseGeneratedText(raw);
      expect(result.title).toBe('Cats');
      expect(result.category).toBe('technology');
      expect(result.difficulty).toBe('easy');
    });

    it('extracts JSON without fences', () => {
      const raw =
        '{"title":"Dogs","description":"About dogs","content":"Dogs are great","category":"history","difficulty":"medium"}';
      const result = parser.parseGeneratedText(raw);
      expect(result.title).toBe('Dogs');
      expect(result.category).toBe('history');
    });

    it('normalises spaces and hyphens in category', () => {
      const raw =
        '{"title":"X","description":"X","content":"X","category":"pop culture","difficulty":"hard"}';
      const result = parser.parseGeneratedText(raw);
      expect(result.category).toBe('pop_culture');
    });

    it('falls back to medium for unknown difficulty', () => {
      const raw =
        '{"title":"X","description":"X","content":"X","category":"technology","difficulty":"unknown_thing"}';
      const result = parser.parseGeneratedText(raw);
      expect(result.difficulty).toBe('medium');
    });

    it('throws on invalid category', () => {
      const raw =
        '{"title":"X","description":"X","content":"X","category":"cooking","difficulty":"easy"}';
      expect(() => parser.parseGeneratedText(raw)).toThrow();
    });

    it('throws on missing required fields', () => {
      const raw = '{"title":"X","description":"X"}';
      expect(() => parser.parseGeneratedText(raw)).toThrow();
    });

    it('matches dynamic user categories ignoring accents and separators', () => {
      const raw = JSON.stringify({
        title: 'La Música en Viena',
        description: 'Sobre composición clásica.',
        content: 'Un texto educativo.',
        category: 'Musica Clasica',
        difficulty: 'medium',
      });
      const result = parser.parseGeneratedText(raw, ['Música Clásica']);
      expect(result.title).toBe('La Música en Viena');
      expect(result.category).toBe('musica_clasica');
    });

    it('strips <think> reasoning tags before parsing JSON', () => {
      const raw = `<think>First think {ignore: bad json}</think>\n\`\`\`json\n{"title":"Révolution","description":"Histoire","content":"Texte clair.","category":"history","difficulty":"easy"}\n\`\`\``;
      const result = parser.parseGeneratedText(raw);
      expect(result.title).toBe('Révolution');
      expect(result.difficulty).toBe('easy');
    });
  });

  describe('parseEvaluation', () => {
    it('parses a passing score', () => {
      const raw = '{"score": 92, "passed": true, "feedback": "Great work"}';
      const result = parser.parseEvaluation(raw);
      expect(result.score).toBe(92);
      expect(result.passed).toBe(true);
      expect(result.feedback).toBe('Great work');
    });

    it('clamps a too-high score to 100', () => {
      const raw = '{"score": 250, "passed": true, "feedback": "x"}';
      const result = parser.parseEvaluation(raw);
      expect(result.score).toBe(100);
    });

    it('clamps a negative score to 0', () => {
      const raw = '{"score": -5, "passed": false, "feedback": "x"}';
      const result = parser.parseEvaluation(raw);
      expect(result.score).toBe(0);
    });

    it('derives passed=false when score < 80', () => {
      const raw = '{"score": 50, "passed": true, "feedback": "x"}';
      const result = parser.parseEvaluation(raw);
      expect(result.passed).toBe(false);
    });
  });

  describe('parseExplanation', () => {
    it('extracts explanation JSON even when prefixed by provider control noise or <think> tags', () => {
      const raw =
        ']<]minimax[>[<tool_call> final answer JSON{"explanation":"La fermentation transforme les sucres."}';
      expect(parser.parseExplanation(raw)).toBe('La fermentation transforme les sucres.');
    });

    it('falls back cleanly to trimmed text when no JSON object is present', () => {
      expect(parser.parseExplanation('<think>note</think>Simple plain explanation.')).toBe(
        'Simple plain explanation.',
      );
    });
  });
});
