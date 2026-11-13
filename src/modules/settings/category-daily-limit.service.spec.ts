import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AppConfigService } from '../../config/env.config';
import type { DrizzleDb } from '../../database/database.module';
import { CategoryDailyLimitService } from './category-daily-limit.service';

describe('CategoryDailyLimitService', () => {
  let usedKeysInDb: string[];
  let insertValuesMock: jest.Mock;
  let dbMock: { transaction: jest.Mock };
  let configMock: AppConfigService;
  let service: CategoryDailyLimitService;

  beforeEach(() => {
    usedKeysInDb = [];
    insertValuesMock = jest.fn().mockImplementation((rows: Array<{ canonicalKey: string }>) => {
      for (const r of rows) {
        if (!usedKeysInDb.includes(r.canonicalKey)) {
          usedKeysInDb.push(r.canonicalKey);
        }
      }
      return {
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      };
    });

    const txMock = {
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockImplementation(() =>
              Promise.resolve(usedKeysInDb.map((canonicalKey) => ({ canonicalKey }))),
            ),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: insertValuesMock,
      }),
    };

    dbMock = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)),
    };

    configMock = {
      moderation: {
        enabled: true,
        aiEnabled: true,
        aiProvider: 'auto',
        dailyCategoryLimit: 20,
        scoreThreshold: 0.45,
        timeoutMs: 5000,
        cacheTtlMs: 86_400_000,
        openaiApiKey: undefined,
        openaiEndpoint: 'https://api.openai.com/v1/moderations',
        openaiModel: 'omni-moderation-latest',
        perspectiveApiKey: undefined,
      },
    } as unknown as AppConfigService;

    service = new CategoryDailyLimitService(dbMock as unknown as DrizzleDb, configMock);
  });

  it('does not consume daily quota when keeping, reordering, deleting or choosing official catalog categories', async () => {
    usedKeysInDb = Array.from({ length: 20 }, (_, i) => `used-${i + 1}`);

    await expect(
      service.assertAndRecordDailyQuota(
        7,
        ['history', 'Astronomía Moderna', 'Technology'],
        ['Astronomía Moderna', 'Café & Arte'],
      ),
    ).resolves.toBeUndefined();

    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it('allows up to 20 distinct new custom categories per day and blocks #21 (including create-delete cycles) with 429', async () => {
    for (let i = 1; i <= 20; i++) {
      await service.assertAndRecordDailyQuota(7, [`Custom Tema ${i}`], [`Custom Tema ${i - 1}`]);
    }
    expect(usedKeysInDb).toHaveLength(20);

    // Re-adding an earlier evaluated custom category today stays within distinct limit
    await expect(
      service.assertAndRecordDailyQuota(7, ['Custom Tema 5'], ['Custom Tema 20']),
    ).resolves.toBeUndefined();

    // Attempting #21 throws 429 CATEGORY_DAILY_LIMIT_REACHED without inserting #21
    await expect(
      service.assertAndRecordDailyQuota(7, ['Custom Tema 21'], ['Custom Tema 20']),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({
        code: ErrorCode.CATEGORY_DAILY_LIMIT_REACHED,
        details: expect.objectContaining({ limit: 20, used: 20, remaining: 0 }),
      }),
    });
    expect(usedKeysInDb).toHaveLength(20);
  });

  it('blocks a single bulk payload exceeding remaining daily quota before inserting anything', async () => {
    const bulk = Array.from({ length: 21 }, (_, i) => `Tema Bulk ${i + 1}`);

    let caught: AppHttpException | null = null;
    try {
      await service.assertAndRecordDailyQuota(7, bulk, []);
    } catch (err) {
      caught = err as AppHttpException;
    }

    expect(caught).toBeInstanceOf(AppHttpException);
    expect(caught?.getStatus()).toBe(429);
    expect(caught?.getResponse()).toMatchObject({
      code: ErrorCode.CATEGORY_DAILY_LIMIT_REACHED,
    });
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});
