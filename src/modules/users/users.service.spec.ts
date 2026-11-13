import type { DrizzleDb } from '../../database/database.module';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let dbMock: { select: jest.Mock; update: jest.Mock; insert: jest.Mock };
  let service: UsersService;

  const baseUser = {
    id: 42,
    email: 'a@b.c',
    fullName: 'A B',
    password: 'hash',
    subscriptionTier: 'dolly_plus',
    currentStreak: 3,
    lastStreakDate: '2026-10-17',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: null,
    deletedAt: null,
  };

  beforeEach(() => {
    dbMock = {
      select: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
    };
    service = new UsersService(dbMock as unknown as DrizzleDb);
  });

  it('returns active selectedLanguages sliced to the user plan limit in getProfile', async () => {
    dbMock.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ ...baseUser, subscriptionTier: 'dolly' }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ selectedLanguages: ['it', 'es', 'fr', 'de'] }]),
          }),
        }),
      });

    const profile = await service.getProfile(42);
    expect(profile.subscriptionTier).toBe('dolly');
    expect(profile.selectedLanguages).toEqual(['it']);
  });

  it('returns empty selectedLanguages when user has no active subscription', async () => {
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ ...baseUser, subscriptionTier: null }]),
        }),
      }),
    });

    const profile = await service.getProfile(42);
    expect(profile.selectedLanguages).toEqual([]);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('returns up to 2 languages for dolly_plus in updateProfile', async () => {
    dbMock.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ ...baseUser, subscriptionTier: 'dolly_plus' }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ selectedLanguages: ['fr', 'it', 'es'] }]),
          }),
        }),
      });
    dbMock.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest
            .fn()
            .mockResolvedValue([
              { ...baseUser, fullName: 'Jane Doe', subscriptionTier: 'dolly_plus' },
            ]),
        }),
      }),
    });

    const profile = await service.updateProfile(42, { fullName: 'Jane Doe' });
    expect(profile.fullName).toBe('Jane Doe');
    expect(profile.selectedLanguages).toEqual(['fr', 'it']);
  });
});
