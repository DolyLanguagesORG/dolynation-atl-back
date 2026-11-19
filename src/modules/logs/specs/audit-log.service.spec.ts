import { Logger } from '@nestjs/common';
import { auditLogs } from '../../../database/drizzle/schema';
import { AuditLogService } from '../audit-log.service';
import { RequestContextService } from '../request-context.service';

describe('AuditLogService', () => {
  let dbMock: { insert: jest.Mock };
  let valuesMock: jest.Mock;
  let requestContext: RequestContextService;
  let service: AuditLogService;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    valuesMock = jest.fn().mockResolvedValue(undefined);
    dbMock = {
      insert: jest.fn().mockReturnValue({ values: valuesMock }),
    };
    requestContext = new RequestContextService();
    service = new AuditLogService(dbMock as never, requestContext);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enriches CREATE audit entries with request context and emits both to Pino and DB', async () => {
    await requestContext.run(
      {
        requestId: 'req-create-1',
        ipAddress: '203.0.113.55',
        userAgent: 'TestAgent/1.0',
        country: 'MX',
        httpMethod: 'POST',
        httpPath: '/api/v1/readings',
        startedAt: Date.now() - 15,
        actorUserId: 7,
        actorEmail: 'ana@example.com',
        actorRole: 'student',
      },
      async () => {
        await service.logCreate({
          module: 'readings',
          event: 'reading.generated',
          entityType: 'readings',
          entityId: 99,
          targetUserId: 7,
          summary: 'Generated reading #99',
          afterState: { id: 99, title: 'Tech', password: 'never-leak-this-password' },
          metadata: { seed: 'seed-1' },
        });
      },
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        logType: 'audit',
        requestId: 'req-create-1',
        action: 'CREATE',
        event: 'reading.generated',
        ipAddress: '203.0.113.55',
      }),
    );
    expect(dbMock.insert).toHaveBeenCalledWith(auditLogs);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-create-1',
        actorUserId: 7,
        actorEmail: 'ana@example.com',
        actorRole: 'student',
        targetUserId: 7,
        ipAddress: '203.0.113.55',
        userAgent: 'TestAgent/1.0',
        httpMethod: 'POST',
        httpPath: '/api/v1/readings',
        module: 'readings',
        action: 'CREATE',
        event: 'reading.generated',
        entityType: 'readings',
        entityId: '99',
        changedFields: [],
        afterState: { id: 99, title: 'Tech', password: '[REDACTED]' },
        metadata: { seed: 'seed-1', country: 'MX' },
      }),
    );
  });

  it('computes before/after changedFields on UPDATE and SOFT_DELETE', async () => {
    await service.logUpdate({
      module: 'users',
      event: 'user.profile_updated',
      entityType: 'users',
      entityId: 42,
      beforeState: { id: 42, fullName: 'Ana', subscriptionTier: 'dolly' },
      afterState: { id: 42, fullName: 'Ana Maria', subscriptionTier: 'dolly' },
      summary: 'Updated user profile',
    });

    expect(valuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        changedFields: ['fullName'],
      }),
    );

    const deletedAt = new Date('2026-11-16T21:00:00Z');
    await service.logSoftDelete({
      module: 'readings',
      event: 'reading.soft_deleted',
      entityType: 'readings',
      entityId: 12,
      beforeState: { id: 12, status: 'pending', deletedAt: null },
      afterState: { id: 12, status: 'pending', deletedAt },
      summary: 'Soft deleted reading #12',
    });

    expect(valuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'SOFT_DELETE',
        changedFields: ['deletedAt'],
        afterState: { id: 12, status: 'pending', deletedAt: '2026-11-16T21:00:00.000Z' },
      }),
    );
  });

  it('fails open when database insert rejects', async () => {
    valuesMock.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.logDelete({
        module: 'settings',
        event: 'settings.category_daily_quota_released',
        entityType: 'category_daily_usage',
        entityId: '7:2026-11-16',
        beforeState: { releasedKeys: ['quantum'] },
        summary: 'Released key',
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
  });
});
