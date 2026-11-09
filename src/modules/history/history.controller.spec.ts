import { Test } from '@nestjs/testing';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

describe('HistoryController', () => {
  let controller: HistoryController;
  let history: jest.Mocked<Pick<HistoryService, 'getSummary' | 'recentScoresFor'>>;
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };

  beforeEach(async () => {
    history = {
      getSummary: jest.fn().mockResolvedValue({
        readings: { total: 3, pending: 1, completed: 2, passed: 1, averageScore: 75 },
        recentScores: [],
        wordsLookedUp: 0,
      }),
      recentScoresFor: jest.fn().mockResolvedValue([
        {
          readingId: 7,
          title: 'Steam engines',
          score: 85,
          passed: true,
          evaluatedAt: new Date('2026-10-17T00:00:00Z'),
        },
      ]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HistoryController],
      providers: [{ provide: HistoryService, useValue: history }],
    }).compile();

    controller = moduleRef.get(HistoryController);
  });

  describe('GET /history', () => {
    it('returns the aggregated summary', async () => {
      const result = await controller.getSummary(user);
      expect(result.data.readings.total).toBe(3);
      expect(result.data.readings.averageScore).toBe(75);
      expect(result.data.wordsLookedUp).toBe(0);
      expect(history.getSummary).toHaveBeenCalledWith(42);
    });
  });

  describe('GET /history/scores', () => {
    it('returns the recent scores list', async () => {
      const result = await controller.getScores(user);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ readingId: 7, score: 85, passed: true });
      expect(history.recentScoresFor).toHaveBeenCalledWith(42);
    });
  });
});
