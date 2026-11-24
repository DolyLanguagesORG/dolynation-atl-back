import { Test } from '@nestjs/testing';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsService } from './friendships.service';
import { FriendStreakService } from './friend-streak.service';

describe('FriendshipsController', () => {
  let controller: FriendshipsController;
  let service: jest.Mocked<
    Pick<FriendshipsService, 'createRequest' | 'previewInviteLink' | 'acceptRequest' | 'blockUser'>
  >;
  const user: AuthUser = { id: 42, email: 'student@example.com', fullName: 'A Student' };

  beforeEach(async () => {
    service = {
      createRequest: jest.fn().mockResolvedValue({
        requestId: 8,
        id: 7,
        fullName: 'Friend',
        since: new Date(),
        direction: 'outgoing',
        origin: 'email',
        createdAt: new Date(),
      }),
      previewInviteLink: jest.fn().mockResolvedValue({
        inviterName: 'Friend',
        valid: true,
        expiresAt: new Date(),
        alreadyFriends: true,
      }),
      acceptRequest: jest.fn().mockResolvedValue({
        id: 7,
        friend: { id: 8, fullName: 'Friend', since: new Date() },
        createdAt: new Date(),
      }),
      blockUser: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FriendshipsController],
      providers: [
        { provide: FriendshipsService, useValue: service },
        { provide: FriendStreakService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(FriendshipsController);
  });

  it('delegates email invitations to the authenticated user', async () => {
    const result = await controller.createRequest(user, { email: 'friend@example.com' });

    expect(result.data.requestId).toBe(8);
    expect(service.createRequest).toHaveBeenCalledWith(42, 'friend@example.com');
  });

  it('supports an anonymous preview while preserving alreadyFriends', async () => {
    const result = await controller.previewInviteLink({ token: 'a'.repeat(43) });

    expect(result.data).toMatchObject({ inviterName: 'Friend', alreadyFriends: true });
    expect(service.previewInviteLink).toHaveBeenCalledWith('a'.repeat(43), undefined);
  });

  it('passes the authenticated user to request acceptance', async () => {
    const result = await controller.acceptRequest(user, 7);

    expect(result.data.friend.id).toBe(8);
    expect(service.acceptRequest).toHaveBeenCalledWith(42, 7);
  });

  it('delegates blocking to the service', async () => {
    const result = await controller.blockUser(user, 8);

    expect(result.data).toBeNull();
    expect(service.blockUser).toHaveBeenCalledWith(42, 8);
  });
});
