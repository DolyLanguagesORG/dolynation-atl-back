import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { DRIZZLE } from '../../database/database.tokens';
import { AuthEmailTokenService } from './auth-email-token.service';
import {
  EMAIL_TOKEN_TYPE_PASSWORD_RESET,
  EMAIL_TOKEN_TYPE_VERIFICATION,
} from '../mail/mail.constants';

describe('AuthEmailTokenService', () => {
  let service: AuthEmailTokenService;

  const insertValues = jest.fn();
  const selectLimit = jest.fn();
  const updateReturning = jest.fn();
  const updateSet = jest.fn();
  const db = {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    insertValues.mockReset().mockResolvedValue(undefined);
    selectLimit.mockReset().mockResolvedValue([]);
    updateReturning.mockReset().mockResolvedValue([]);
    updateSet
      .mockReset()
      .mockReturnValue({ where: jest.fn().mockReturnValue({ returning: updateReturning }) });

    db.insert.mockReset().mockReturnValue({ values: insertValues });
    db.select.mockReset().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ limit: selectLimit }),
      }),
    });
    db.update.mockReset().mockReturnValue({ set: updateSet });

    const moduleRef = await Test.createTestingModule({
      providers: [AuthEmailTokenService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = moduleRef.get(AuthEmailTokenService);
  });

  describe('issue', () => {
    it('returns the token in clear but persists only its hash', async () => {
      const token = await service.issue({
        userId: 7,
        type: EMAIL_TOKEN_TYPE_VERIFICATION,
        ttlMinutes: 60,
      });

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);

      const inserted = insertValues.mock.calls[0]?.[0] as {
        userId: number;
        type: string;
        tokenHash: string;
        expiresAt: Date;
      };
      const expectedHash = createHash('sha256').update(token).digest('hex');
      expect(inserted.tokenHash).toBe(expectedHash);
      expect(inserted.tokenHash).not.toBe(token);
      expect(inserted.userId).toBe(7);
      expect(inserted.type).toBe(EMAIL_TOKEN_TYPE_VERIFICATION);
    });

    it('sets the expiration from the requested ttl', async () => {
      const before = Date.now();
      await service.issue({
        userId: 7,
        type: EMAIL_TOKEN_TYPE_PASSWORD_RESET,
        ttlMinutes: 15,
      });

      const inserted = insertValues.mock.calls[0]?.[0] as { expiresAt: Date };
      const ttlMs = inserted.expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThan(14 * 60_000);
      expect(ttlMs).toBeLessThanOrEqual(15 * 60_000 + 1000);
    });

    it('revokes the previously active tokens of the same type before inserting', async () => {
      await service.issue({
        userId: 7,
        type: EMAIL_TOKEN_TYPE_VERIFICATION,
        ttlMinutes: 60,
      });

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(insertValues).toHaveBeenCalledTimes(1);
    });
  });

  describe('consume', () => {
    it('returns the owner when the token is valid', async () => {
      selectLimit.mockResolvedValue([{ id: 3, userId: 42 }]);
      updateReturning.mockResolvedValue([{ id: 3 }]);

      const result = await service.consume('token-en-claro', EMAIL_TOKEN_TYPE_VERIFICATION);

      expect(result).toEqual({ userId: 42 });
    });

    it('marks the token as consumed atomically', async () => {
      selectLimit.mockResolvedValue([{ id: 3, userId: 42 }]);
      updateReturning.mockResolvedValue([{ id: 3 }]);

      await service.consume('token-en-claro', EMAIL_TOKEN_TYPE_VERIFICATION);

      const setPayload = updateSet.mock.calls[0]?.[0] as { consumedAt: Date };
      expect(setPayload.consumedAt).toBeInstanceOf(Date);
    });

    it('rejects a token that does not exist', async () => {
      selectLimit.mockResolvedValue([]);

      const result = await service.consume('token-inexistente', EMAIL_TOKEN_TYPE_VERIFICATION);

      expect(result).toBeNull();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('rejects a token that was consumed concurrently by another request', async () => {
      selectLimit.mockResolvedValue([{ id: 3, userId: 42 }]);
      // La actualización atómica no afecta a ninguna fila: otra petición ganó la carrera.
      updateReturning.mockResolvedValue([]);

      const result = await service.consume('token-en-claro', EMAIL_TOKEN_TYPE_VERIFICATION);

      expect(result).toBeNull();
    });
  });

  describe('revokeActive', () => {
    it('marks every active token of the type as consumed', async () => {
      await service.revokeActive(42, EMAIL_TOKEN_TYPE_PASSWORD_RESET);

      expect(db.update).toHaveBeenCalledTimes(1);
      const setPayload = updateSet.mock.calls[0]?.[0] as { consumedAt: Date };
      expect(setPayload.consumedAt).toBeInstanceOf(Date);
    });
  });
});
