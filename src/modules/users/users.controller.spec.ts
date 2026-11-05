import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService, type PublicUser } from './users.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

describe('UsersController', () => {
  let controller: UsersController;
  let users: jest.Mocked<Pick<UsersService, 'activeStreakFor' | 'getProfile' | 'updateProfile'>>;
  const user: AuthUser = { id: 42, email: 'a@b.c', fullName: 'A B' };
  const profile: PublicUser = {
    id: 42,
    email: 'a@b.c',
    fullName: 'A B',
    currentStreak: 3,
    lastStreakDate: '2026-10-17',
    createdAt: new Date('2026-10-01T00:00:00Z'),
  };

  beforeEach(async () => {
    users = {
      activeStreakFor: jest.fn().mockResolvedValue([1, 0, 1, 1, 0, 1, 1]),
      getProfile: jest.fn().mockResolvedValue(profile),
      updateProfile: jest.fn().mockResolvedValue({ ...profile, fullName: 'Jane Doe' }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: users }],
    }).compile();

    controller = moduleRef.get(UsersController);
  });

  describe('GET /user/profile', () => {
    it('returns the authenticated user’s profile', async () => {
      const result = await controller.getProfile(user);
      expect(result.data).toEqual(profile);
      expect(result.message).toBe('User profile');
      expect(users.getProfile).toHaveBeenCalledWith(42);
    });
  });

  describe('PATCH /user/profile', () => {
    it('updates fullName and returns the new profile', async () => {
      const result = await controller.updateProfile(user, { fullName: 'Jane Doe' });
      expect(result.data.fullName).toBe('Jane Doe');
      expect(result.message).toBe('Profile updated');
      expect(users.updateProfile).toHaveBeenCalledWith(42, { fullName: 'Jane Doe' });
    });

    it('accepts an empty body as a no-op', async () => {
      users.updateProfile.mockResolvedValue(profile);
      const result = await controller.updateProfile(user, {});
      expect(result.data).toEqual(profile);
      expect(users.updateProfile).toHaveBeenCalledWith(42, {});
    });
  });

  describe('GET /user/streak', () => {
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
});
