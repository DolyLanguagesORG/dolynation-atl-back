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
    roleId: 1,
    subscriptionTier: 'dolly_plus',
    stripeCustomerId: null,
    currentStreak: 3,
    lastStreakDate: '2026-10-17',
    emailVerifiedAt: null,
    locale: 'es',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: null,
    deletedAt: null,
  };

  const mockUserFindSelect = (result: unknown[]): void => {
    const whereObj = { limit: jest.fn().mockResolvedValue(result) };
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(whereObj),
        }),
        where: jest.fn().mockReturnValue(whereObj),
      }),
    });
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
    mockUserFindSelect([{ user: { ...baseUser, subscriptionTier: 'dolly' }, roleName: 'student' }]);
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ selectedLanguages: ['it', 'es', 'fr', 'de'] }]),
        }),
      }),
    });

    const profile = await service.getProfile(42);
    expect(profile.role).toBe('student');
    expect(profile.subscriptionTier).toBe('dolly');
    expect(profile.selectedLanguages).toEqual(['it']);
  });

  it('returns empty selectedLanguages when user has no active subscription', async () => {
    mockUserFindSelect([{ user: { ...baseUser, subscriptionTier: null }, roleName: 'student' }]);

    const profile = await service.getProfile(42);
    expect(profile.selectedLanguages).toEqual([]);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('resolves admin role in findById and toPublic', async () => {
    mockUserFindSelect([{ user: { ...baseUser, roleId: 2 }, roleName: 'admin' }]);

    const found = await service.findById(42);
    expect(found?.role).toBe('admin');
    expect(service.toPublic(found!).role).toBe('admin');
  });

  it('returns up to 2 languages for dolly_plus in updateProfile', async () => {
    mockUserFindSelect([
      { user: { ...baseUser, subscriptionTier: 'dolly_plus' }, roleName: 'student' },
    ]);
    dbMock.select.mockReturnValueOnce({
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
    mockUserFindSelect([
      { user: { ...baseUser, currentStreak: 0, lastStreakDate: null }, roleName: 'student' },
    ]);
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });

    const days = await service.activeStreakFor(42, 7, new Date('2026-11-13T12:00:00Z'));
    expect(days).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('marks only days with completed readings or active consecutive streak in activeStreakFor', async () => {
    mockUserFindSelect([
      {
        user: { ...baseUser, currentStreak: 2, lastStreakDate: '2026-11-13' },
        roleName: 'student',
      },
    ]);
    dbMock.select.mockReturnValueOnce({
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
    mockUserFindSelect([
      {
        user: { ...baseUser, currentStreak: 2, lastStreakDate: '2026-11-12' },
        roleName: 'student',
      },
    ]);
    await service.recordDailyActivity(42, new Date('2026-11-13T12:00:00Z'));
    expect(setMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentStreak: 3, lastStreakDate: '2026-11-13' }),
    );

    // Gap (> 1 day): 4 -> 1
    mockUserFindSelect([
      {
        user: { ...baseUser, currentStreak: 4, lastStreakDate: '2026-11-10' },
        roleName: 'student',
      },
    ]);
    await service.recordDailyActivity(42, new Date('2026-11-13T12:00:00Z'));
    expect(setMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentStreak: 1, lastStreakDate: '2026-11-13' }),
    );
  });

  describe('día de negocio en America/Mexico_City (UTC-6)', () => {
    // 2026-11-14T03:00Z = viernes 13 de noviembre, 21:00 en CDMX.
    const fridayNightCdmx = new Date('2026-11-14T03:00:00Z');

    it('counts an evening session as the local day in recordDailyActivity', async () => {
      const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
      dbMock.update.mockReturnValue({ set: setMock });
      mockUserFindSelect([
        {
          user: { ...baseUser, currentStreak: 2, lastStreakDate: '2026-11-12' },
          roleName: 'student',
        },
      ]);

      await service.recordDailyActivity(42, fridayNightCdmx);

      expect(setMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentStreak: 3, lastStreakDate: '2026-11-13' }),
      );
    });

    it('does not count two sessions on the same local day as consecutive days', async () => {
      const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
      dbMock.update.mockReturnValue({ set: setMock });
      // Ya estudió el viernes 13 por la mañana; vuelve a las 21:00 del mismo viernes.
      mockUserFindSelect([
        {
          user: { ...baseUser, currentStreak: 2, lastStreakDate: '2026-11-13' },
          roleName: 'student',
        },
      ]);

      await service.recordDailyActivity(42, fridayNightCdmx);

      expect(setMock).not.toHaveBeenCalled();
    });

    it('keeps yesterday’s streak alive in toPublic during the local evening', () => {
      jest.useFakeTimers().setSystemTime(fridayNightCdmx);
      try {
        const profile = service.toPublic({
          ...baseUser,
          currentStreak: 5,
          lastStreakDate: '2026-11-12',
        });
        expect(profile.currentStreak).toBe(5);
      } finally {
        jest.useRealTimers();
      }
    });

    it('places an evening reading on its local day in activeStreakFor', async () => {
      mockUserFindSelect([
        { user: { ...baseUser, currentStreak: 0, lastStreakDate: null }, roleName: 'student' },
      ]);
      dbMock.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            // Jueves 12 a las 20:00 en CDMX.
            {
              updatedAt: new Date('2026-11-13T02:00:00Z'),
              createdAt: new Date('2026-11-13T01:00:00Z'),
            },
          ]),
        }),
      });

      // Viernes 13 al mediodía en CDMX: ventana miércoles 11, jueves 12 y viernes 13.
      const days = await service.activeStreakFor(42, 3, new Date('2026-11-13T18:00:00Z'));
      expect(days).toEqual([0, 1, 0]);
    });
  });

  it('creates an OAuth user with null password and verified email timestamp', async () => {
    const verifiedAt = new Date('2026-11-21T00:00:00Z');
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });
    const valuesMock = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([
        {
          ...baseUser,
          id: 99,
          email: 'oauth@example.com',
          fullName: 'OAuth Student',
          password: null,
          emailVerifiedAt: verifiedAt,
        },
      ]),
    });
    dbMock.insert.mockReturnValue({ values: valuesMock });

    const created = await service.createOAuthUser({
      email: '  OAuth@Example.com ',
      fullName: '  OAuth Student  ',
      locale: 'en',
      emailVerifiedAt: verifiedAt,
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'oauth@example.com',
        password: null,
        fullName: 'OAuth Student',
        emailVerifiedAt: verifiedAt,
        locale: 'en',
      }),
    );
    expect(created.id).toBe(99);
    expect(created.role).toBe('student');
  });

  it('finds user case-insensitively with findByEmailInsensitive', async () => {
    mockUserFindSelect([{ user: baseUser, roleName: 'student' }]);
    const found = await service.findByEmailInsensitive(' A@B.C ');
    expect(found?.id).toBe(42);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });
});
