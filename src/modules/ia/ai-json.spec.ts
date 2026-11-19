import { normalizeSmartQuoteStrings } from './ai-json';

describe('normalizeSmartQuoteStrings', () => {
  it('converts guillemets used as string delimiters into valid JSON strings', () => {
    const raw = '{"title": «El enigma», "category": «technology»}';
    expect(normalizeSmartQuoteStrings(raw)).toBe(
      '{"title": "El enigma", "category": "technology"}',
    );
  });

  it('converts curly double quotes used as delimiters', () => {
    const raw = '{"title": “El enigma”}';
    expect(normalizeSmartQuoteStrings(raw)).toBe('{"title": "El enigma"}');
  });

  it('leaves guillemets that live inside a valid JSON string untouched', () => {
    const raw = '{"description":"Il dit « bonjour » en francais"}';
    expect(normalizeSmartQuoteStrings(raw)).toBe(raw);
  });

  it('handles nested guillemets without closing the string early', () => {
    const raw = '{"content": «Il dit « bonjour » tres veces»}';
    expect(normalizeSmartQuoteStrings(raw)).toBe('{"content": "Il dit « bonjour » tres veces"}');
  });

  it('escapes quotes and newlines inside a recovered string', () => {
    const raw = '{"content": «El dijo "hola"\ny siguió»}';
    const normalized = normalizeSmartQuoteStrings(raw);
    expect(JSON.parse(normalized)).toEqual({ content: 'El dijo "hola"\ny siguió' });
  });

  it('leaves an unclosed delimiter as literal text instead of corrupting the payload', () => {
    const raw = '{"content": «texto sin cierre';
    expect(normalizeSmartQuoteStrings(raw)).toBe(raw);
  });

  it('is a no-op for payloads without typographic quotes', () => {
    const raw = '{"title":"El enigma","content":"sin comillas angulares"}';
    expect(normalizeSmartQuoteStrings(raw)).toBe(raw);
  });
});
