import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.tokens';
import { HistoryService } from './history.service';

describe('HistoryService', () => {
  it('computes reading stats, recent scores and real wordsLookedUp count from reading_explanations', async () => {
    const dbMock = {
      select: jest
        .fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { id: 1, status: 'completed', score: 90, passed: true },
              { id: 2, status: 'pending', score: null, passed: null },
            ]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest
                  .fn()
                  .mockResolvedValue([
                    { readingId: 1, title: 'La tarde', score: 90, evaluatedAt: new Date() },
                  ]),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 6 }]),
          }),
        }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [HistoryService, { provide: DRIZZLE, useValue: dbMock }],
    }).compile();

    const service = moduleRef.get(HistoryService);
    const summary = await service.getSummary(42);

    expect(summary.readings.total).toBe(2);
    expect(summary.readings.completed).toBe(1);
    expect(summary.readings.pending).toBe(1);
    expect(summary.recentScores).toHaveLength(1);
    expect(summary.wordsLookedUp).toBe(6);
  });
});
