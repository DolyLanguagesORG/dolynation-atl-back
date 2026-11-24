import type { DrizzleDb } from '../../database/database.module';
import { FriendshipsService } from './friendships.service';
import type { UsersService } from '../users/users.service';

type Chain = {
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  orderBy: jest.Mock;
  for: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};

function queryChain(result: unknown): Chain {
  const chain = {} as Chain;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(result);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.for = jest.fn().mockResolvedValue(result);
  chain.then = (resolve) => Promise.resolve(resolve(result));
  return chain;
}

function createTransactionMock(selectResults: unknown[], accepted?: unknown[]) {
  const select = jest.fn();
  for (const result of selectResults) {
    select.mockReturnValueOnce(queryChain(result));
  }
  const returning = jest.fn().mockResolvedValue(accepted ?? []);
  const update = jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ returning }),
    }),
  });
  return { select, update, returning };
}

describe('FriendshipsService', () => {
  const currentUser = {
    id: 2,
    email: 'current@example.com',
    fullName: 'Current User',
    role: 'student' as const,
    deletedAt: null,
    emailVerifiedAt: new Date(),
    subscriptionTier: 'dolly' as const,
  };
  const requester = {
    ...currentUser,
    id: 1,
    email: 'requester@example.com',
    fullName: 'Requester',
  };

  function buildService(selectResults: unknown[], accepted?: unknown[]) {
    const tx = createTransactionMock(selectResults, accepted);
    const db = {
      transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const users = {
      findById: jest.fn().mockResolvedValueOnce(currentUser).mockResolvedValueOnce(requester),
    };
    const service = new FriendshipsService(
      db as unknown as DrizzleDb,
      users as unknown as UsersService,
      {} as never,
    );
    return { service, tx, db };
  }

  it('checks the accepted-friend limit for both participants inside the transaction', async () => {
    const accepted = {
      id: 10,
      requesterId: 1,
      addresseeId: 2,
      status: 'accepted' as const,
      origin: 'email' as const,
      createdAt: new Date(),
    };
    const { service, tx } = buildService(
      [
        [{ id: 10, requesterId: 1, addresseeId: 2, status: 'pending' }],
        [],
        [],
        [{ count: 199 }],
        [{ count: 199 }],
      ],
      [accepted],
    );

    const result = await service.acceptRequest(2, 10);

    expect(result.friend.id).toBe(1);
    expect(tx.select).toHaveBeenCalledTimes(5);
    expect(tx.returning).toHaveBeenCalledTimes(1);
  });

  it('rejects acceptance when the requester has already reached 200 friends', async () => {
    const { service, tx } = buildService([
      [{ id: 10, requesterId: 1, addresseeId: 2, status: 'pending' }],
      [],
      [],
      [{ count: 199 }],
      [{ count: 200 }],
    ]);

    await expect(service.acceptRequest(2, 10)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FRIENDSHIP_LIMIT_REACHED' }),
    });
    expect(tx.returning).not.toHaveBeenCalled();
  });
});
