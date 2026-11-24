import { FriendStreakService } from './friend-streak.service';

describe('FriendStreakService', () => {
  const makeService = (enabled = true) => {
    const db = {
      execute: jest.fn().mockResolvedValue({ rows: [{ locked: true }] }),
    };
    const tx = {
      execute: db.execute,
    };
    (db as typeof db & { transaction: jest.Mock }).transaction = jest.fn(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const service = new FriendStreakService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      { friendStreak: { enabled, expression: '0 6 * * *' } } as never,
    );
    return { db, service };
  };

  it('uses the PostgreSQL advisory lock and runs close/generate in order', async () => {
    const { db, service } = makeService();
    const close = jest.spyOn(service as any, 'closeYesterday').mockResolvedValue(undefined);
    const prepare = jest.spyOn(service as any, 'prepareToday').mockResolvedValue(undefined);
    const generate = jest.spyOn(service as any, 'generateToday').mockResolvedValue(undefined);

    await service.runDaily();

    expect(close).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it('does not touch the database when the feature flag is disabled', async () => {
    const { db, service } = makeService(false);
    await service.runDaily();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('serializes concurrent runs through the same transaction connection', async () => {
    const { db, service } = makeService();
    db.execute
      .mockReset()
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ locked: false }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    const close = jest.spyOn(service as any, 'closeYesterday').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'prepareToday').mockResolvedValue(undefined);
    const generate = jest.spyOn(service as any, 'generateToday').mockResolvedValue(undefined);

    await Promise.all([service.runDaily(), service.runDaily()]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it('preserves the selected category when retrying a generation_failed day', () => {
    const { service } = makeService();
    const choose = (service as any).categoryForDay.bind(service) as (
      existing: { selectedCategory?: string } | undefined,
      pool: string[],
    ) => string;
    expect(choose({ selectedCategory: 'science' }, ['travel', 'history'])).toBe('science');
  });

  it('marks a failed previous day as missed and resets the active streak', async () => {
    const { service } = makeService();
    const day = {
      id: 11,
      streakId: 4,
      streakDate: '2026-11-23',
      status: 'generation_failed',
      userLowCompletedAt: null,
      userHighCompletedAt: null,
    };
    const sets: unknown[] = [];
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([day]),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((value: unknown) => {
          sets.push(value);
          return { where: jest.fn().mockResolvedValue([]) };
        }),
      })),
    };
    jest.useFakeTimers().setSystemTime(new Date('2026-11-24T15:00:00.000Z'));
    await (service as any).closeYesterday(db);
    jest.useRealTimers();

    expect(sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'missed' }),
        expect.objectContaining({ currentStreak: 0 }),
      ]),
    );
  });

  it('keeps source readings isolated when two streak days share user and category', async () => {
    const { service } = makeService();
    const readings = [{ id: 501 }, { id: 502 }];
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue([readings.shift()]),
          })),
        })),
      })),
    };

    const first = await (service as any).sourceReadingForDay(db, 101, 7);
    const second = await (service as any).sourceReadingForDay(db, 202, 7);

    expect(first.id).toBe(501);
    expect(second.id).toBe(502);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('reconciles a generation_failed day with both exact readings without regenerating', async () => {
    const { service } = makeService();
    const sets: unknown[] = [];
    let dayReads = 0;
    const tx = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            for: jest.fn().mockResolvedValue(
              (() => {
                const call = dayReads++;
                return call === 0
                  ? [
                      {
                        id: 303,
                        streakId: 77,
                        streakDate: '2026-11-24',
                        status: 'generation_failed',
                        errorMessage: 'provider timeout',
                        userLowCompletedAt: null,
                        userHighCompletedAt: null,
                      },
                    ]
                  : call === 1
                    ? [{ id: 77, currentStreak: 2, longestStreak: 4 }]
                    : [{ id: 303, status: 'completed', errorMessage: null }];
              })(),
            ),
          })),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((value: unknown) => {
          sets.push(value);
          return { where: jest.fn().mockResolvedValue([]) };
        }),
      })),
    };
    (service as any).db = {
      transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const day = { id: 303, status: 'generation_failed', errorMessage: 'provider timeout' };
    const low = { id: 601, status: 'completed' };
    const high = { id: 602, status: 'completed' };

    await (service as any).reconcileDay(day, low, high);
    await (service as any).reconcileDay(day, low, high);

    expect(sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userLowReadingId: 601,
          userHighReadingId: 602,
          userLowCompletedAt: expect.any(Date),
          userHighCompletedAt: expect.any(Date),
          errorMessage: null,
          status: 'completed',
        }),
        expect.objectContaining({ currentStreak: 3, longestStreak: 4 }),
      ]),
    );
    expect(
      sets.filter((value) => (value as { currentStreak?: number }).currentStreak === 3),
    ).toHaveLength(1);
  });

  it('restores both IDs and leaves the day pending when both readings are pending', async () => {
    const { service } = makeService();
    const sets: unknown[] = [];
    const tx = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            for: jest
              .fn()
              .mockResolvedValue([
                { id: 304, streakId: 78, status: 'generation_failed', errorMessage: 'timeout' },
              ]),
          })),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((value: unknown) => {
          sets.push(value);
          return { where: jest.fn().mockResolvedValue([]) };
        }),
      })),
    };
    (service as any).db = {
      transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await (service as any).reconcileDay(
      { id: 304 },
      { id: 603, status: 'pending' },
      { id: 604, status: 'pending' },
    );

    expect(sets).toEqual([
      expect.objectContaining({
        userLowReadingId: 603,
        userHighReadingId: 604,
        errorMessage: null,
        status: 'pending',
      }),
    ]);
  });

  it('restores both IDs and remains pending when only one reading is completed', async () => {
    const { service } = makeService();
    const sets: unknown[] = [];
    const tx = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            for: jest.fn().mockResolvedValue([
              {
                id: 305,
                streakId: 79,
                status: 'generation_failed',
                errorMessage: 'timeout',
                userLowCompletedAt: null,
                userHighCompletedAt: null,
              },
            ]),
          })),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((value: unknown) => {
          sets.push(value);
          return { where: jest.fn().mockResolvedValue([]) };
        }),
      })),
    };
    (service as any).db = {
      transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await (service as any).reconcileDay(
      { id: 305 },
      { id: 605, status: 'completed' },
      { id: 606, status: 'pending' },
    );

    expect(sets[0]).toEqual(
      expect.objectContaining({
        userLowReadingId: 605,
        userHighReadingId: 606,
        userLowCompletedAt: expect.any(Date),
        userHighCompletedAt: null,
        errorMessage: null,
        status: 'pending',
      }),
    );
    expect(sets.some((value) => 'currentStreak' in (value as object))).toBe(false);
  });
});
