import { sanitizeRecordForLog, sanitizeUnknownForLog } from '../utils/log-sanitizer.util';

describe('log-sanitizer.util', () => {
  it('redacts sensitive credential and token keys recursively', () => {
    const sanitized = sanitizeRecordForLog({
      email: 'ana@example.com',
      password: 'plain-password',
      nested: {
        newPassword: 'secret-new-password',
        refreshToken: 'jwt.refresh.secret',
        accessToken: 'jwt.access.secret',
        tokenHash: 'sha256hash',
        authorization: 'Bearer abc',
        apiKey: 'sk-live',
      },
      // Counters that include "tokens" in a non-secret context must stay visible.
      usage: {
        maxTokens: 1500,
        prompt_tokens: 120,
      },
    });

    expect(sanitized).toEqual({
      email: 'ana@example.com',
      password: '[REDACTED]',
      nested: {
        newPassword: '[REDACTED]',
        refreshToken: '[REDACTED]',
        accessToken: '[REDACTED]',
        tokenHash: '[REDACTED]',
        authorization: '[REDACTED]',
        apiKey: '[REDACTED]',
      },
      usage: {
        maxTokens: 1500,
        prompt_tokens: 120,
      },
    });
  });

  it('serializes Dates to ISO strings, handles circular references and truncates long text', () => {
    const circular: Record<string, unknown> = { ok: true };
    circular['self'] = circular;
    const huge = 'a'.repeat(2500);
    const createdAt = new Date('2026-11-16T10:00:00.000Z');

    const result = sanitizeRecordForLog({
      createdAt,
      content: huge,
      circular,
    });

    expect(result?.['createdAt']).toBe('2026-11-16T10:00:00.000Z');
    expect(String(result?.['content'])).toContain('[truncated: total 2500 chars]');
    expect((result?.['circular'] as Record<string, unknown>)['self']).toBe('[Circular]');
    expect(sanitizeUnknownForLog(42n)).toBe('42');
  });
});
