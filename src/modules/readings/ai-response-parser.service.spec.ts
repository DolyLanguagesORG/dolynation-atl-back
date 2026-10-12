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
});
