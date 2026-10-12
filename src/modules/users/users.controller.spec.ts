import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

describe('UsersController', () => {
  let controller: UsersController;
  let users: jest.Mocked<Pick<UsersService, 'activeStreakFor'>>;
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };

  beforeEach(async () => {
    users = {
      activeStreakFor: jest.fn().mockResolvedValue([1, 0, 1, 1, 0, 1, 1]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: users }],
    }).compile();

    controller = moduleRef.get(UsersController);
  });

  it('returns a 7-day streak history by default', async () => {
    const result = await controller.getStreak(user, { days: 7 });
    expect(result.data.days).toEqual([1, 0, 1, 1, 0, 1, 1]);
    expect(result.data.count).toBe(7);
    expect(users.activeStreakFor).toHaveBeenCalledWith(42, 7);
  });

  it('respects a custom day count', async () => {
    users.activeStreakFor.mockResolvedValue([1, 1, 1]);
    const result = await controller.getStreak(user, { days: 3 });
    expect(result.data.count).toBe(3);
    expect(users.activeStreakFor).toHaveBeenCalledWith(42, 3);
  });
});
