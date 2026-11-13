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

  it('returns all zeros in activeStreakFor for a new user with no completed readings or streak', async () => {
    dbMock.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest
              .fn()
              .mockResolvedValue([{ ...baseUser, currentStreak: 0, lastStreakDate: null }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

    const days = await service.activeStreakFor(42, 7, new Date('2026-11-13T12:00:00Z'));
    expect(days).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('marks only days with completed readings or active consecutive streak in activeStreakFor', async () => {
    dbMock.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest
              .fn()
              .mockResolvedValue([{ ...baseUser, currentStreak: 2, lastStreakDate: '2026-11-13' }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            {
              updatedAt: new Date('2026-11-09T15:00:00Z'),
              createdAt: new Date('2026-11-09T14:00:00Z'),
            },
          ]),
        }),
      });

    const days = await service.activeStreakFor(42, 7, new Date('2026-11-13T12:00:00Z'));
    // Window: Nov 7, 8, 9, 10, 11, 12, 13 -> active on Nov 9 (reading) and Nov 12–13 (2-day streak)
    expect(days).toEqual([0, 0, 1, 0, 0, 1, 1]);
  });

  it('expires stale currentStreak in toPublic when lastStreakDate is more than 1 day old', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T12:00:00Z'));
    try {
      const stale = service.toPublic({
        ...baseUser,
        emailVerifiedAt: null,
        locale: 'es',
        currentStreak: 5,
        lastStreakDate: '2026-11-10',
      });
      expect(stale.currentStreak).toBe(0);

      const active = service.toPublic({
        ...baseUser,
        emailVerifiedAt: null,
        locale: 'es',
        currentStreak: 5,
        lastStreakDate: '2026-11-12',
      });
      expect(active.currentStreak).toBe(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it('increments consecutive streak and resets after gaps in recordDailyActivity', async () => {
    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    dbMock.update.mockReturnValue({ set: setMock });

    // Consecutive day (Nov 12 -> Nov 13): 2 -> 3
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockResolvedValue([{ ...baseUser, currentStreak: 2, lastStreakDate: '2026-11-12' }]),
        }),
      }),
    });
    await service.recordDailyActivity(42, new Date('2026-11-13T12:00:00Z'));
    expect(setMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentStreak: 3, lastStreakDate: '2026-11-13' }),
    );

    // Gap (> 1 day): 4 -> 1
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockResolvedValue([{ ...baseUser, currentStreak: 4, lastStreakDate: '2026-11-10' }]),
        }),
      }),
    });
    await service.recordDailyActivity(42, new Date('2026-11-13T12:00:00Z'));
    expect(setMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentStreak: 1, lastStreakDate: '2026-11-13' }),
    );
  });
});
