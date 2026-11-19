import { computeStateDiff } from '../utils/state-diff.util';

describe('state-diff.util', () => {
  it('computes changedFields accurately and ignores reordered nested keys', () => {
    const before = {
      id: 42,
      fullName: 'Old Name',
      password: 'old-secret-password',
      preferences: { a: 1, b: 2 },
      unchanged: 'same',
    };
    const after = {
      id: 42,
      fullName: 'New Name',
      password: 'new-secret-password',
      preferences: { b: 2, a: 1 },
      unchanged: 'same',
    };

    const diff = computeStateDiff(before, after);

    expect(diff.beforeState?.['password']).toBe('[REDACTED]');
    expect(diff.afterState?.['password']).toBe('[REDACTED]');
    expect(diff.changedFields).toEqual(['fullName']);
  });

  it('returns empty changedFields when one state is null', () => {
    const diff = computeStateDiff(null, { id: 1, status: 'pending' });
    expect(diff.beforeState).toBeNull();
    expect(diff.afterState).toEqual({ id: 1, status: 'pending' });
    expect(diff.changedFields).toEqual([]);
  });
});
