import { isPgUniqueViolation } from './pg-errors';

describe('isPgUniqueViolation', () => {
  it('detects a raw pg unique violation', () => {
    expect(isPgUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('detects a unique violation wrapped by DrizzleQueryError in `cause`', () => {
    const wrapped = Object.assign(new Error('Failed query: insert into "users" ...'), {
      cause: { code: '23505', constraint: 'users_email_unique' },
    });
    expect(isPgUniqueViolation(wrapped)).toBe(true);
  });

  it('ignores other database errors and non-objects', () => {
    expect(isPgUniqueViolation({ code: '23503' })).toBe(false);
    expect(isPgUniqueViolation(new Error('boom'))).toBe(false);
    expect(isPgUniqueViolation({ cause: { code: '40001' } })).toBe(false);
    expect(isPgUniqueViolation(null)).toBe(false);
    expect(isPgUniqueViolation('23505')).toBe(false);
  });
});
