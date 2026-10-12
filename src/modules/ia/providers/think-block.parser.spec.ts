import { ThinkBlockParser } from './think-block.parser';

describe('ThinkBlockParser', () => {
  it('passes through text that has no think block', () => {
    const parser = new ThinkBlockParser();
    // The parser may hold back the last 7 chars waiting for a possible
    // open-tag split. consume() emits what it can NOW, flush() emits the rest.
    const duringStream = parser.consume('Hello world');
    const afterFlush = parser.flush();
    const all = [...duringStream, ...afterFlush].map((e) => e.value).join('');
    expect(all).toBe('Hello world');
  });

  it('drops a complete think block and emits only the trailing text', () => {
    const parser = new ThinkBlockParser();
    const result = parser.consume('<think>internal thought</think>actual answer');
    expect(result).toEqual([{ type: 'text', value: 'actual answer' }]);
  });

  it('handles a think block that spans multiple chunks (arrives split)', () => {
    const parser = new ThinkBlockParser();

    // chunk 1: opening tag + half of the think content
    const r1 = parser.consume('<think>thinking about');
    // chunk 2: rest of the think + closing tag + first chars of real content
    const r2 = parser.consume(' it</think>the answer');

    const all = [...r1, ...r2];
    expect(all).toEqual([{ type: 'text', value: 'the answer' }]);
  });

  it('handles a chunk that contains only the opening tag', () => {
    const parser = new ThinkBlockParser();
    const r1 = parser.consume('<think>');
    const r2 = parser.consume('thinking</think>hi');
    const all = [...r1, ...r2];
    expect(all).toEqual([{ type: 'text', value: 'hi' }]);
  });

  it('trims leading whitespace after a think block', () => {
    const parser = new ThinkBlockParser();
    const result = parser.consume('<think>x</think>\n\n  answer');
    expect(result).toEqual([{ type: 'text', value: 'answer' }]);
  });

  it('emits no text if only the think block was sent and nothing else', () => {
    const parser = new ThinkBlockParser();
    const result = parser.consume('<think>just thinking</think>');
    expect(result).toEqual([]);
  });

  it('falls back gracefully if stream ends with an unclosed think block (flush emits nothing)', () => {
    const parser = new ThinkBlockParser();
    parser.consume('<think>never closes');
    const flushed = parser.flush();
    // We must NOT leak the think content. Either empty or signal an error.
    expect(
      flushed.find((f) => f.type === 'text' && f.value.includes('never closes')),
    ).toBeUndefined();
  });
});
