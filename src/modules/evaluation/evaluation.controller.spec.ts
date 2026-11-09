import { Test } from '@nestjs/testing';
import { EvaluationController } from './evaluation.controller';
import { ReadingsService } from '../readings/readings.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

describe('EvaluationController', () => {
  let controller: EvaluationController;
  let readings: jest.Mocked<Pick<ReadingsService, 'evaluate'>>;
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };

  beforeEach(async () => {
    readings = {
      evaluate: jest.fn().mockResolvedValue({
        score: 85,
        passed: true,
        feedback: 'Great summary.',
        userResponse: 'The reading was about X and Y.',
        reading: { id: 7, status: 'completed' },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EvaluationController],
      providers: [{ provide: ReadingsService, useValue: readings }],
    }).compile();

    controller = moduleRef.get(EvaluationController);
  });

  it('delegates to ReadingsService.evaluate with the user’s id', async () => {
    const result = await controller.submit(user, {
      readingId: 7,
      userResponse: 'The reading was about X and Y.'.padEnd(20, '.'),
    });

    expect(result.message).toBe('Evaluation complete');
    expect(result.data).toMatchObject({ score: 85, passed: true });
    expect(readings.evaluate).toHaveBeenCalledWith(7, 42, {
      userResponse: expect.any(String),
    });
  });
});
