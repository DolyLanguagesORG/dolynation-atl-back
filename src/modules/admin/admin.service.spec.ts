import { Test } from '@nestjs/testing';
import { ErrorCode } from '../../common/errors/error-codes';
import { DRIZZLE } from '../../database/database.tokens';
import { MailService } from '../mail/mail.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let dbMock: {
    select: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };
  let mailMock: {
    sendAccessRequestApproved: jest.Mock;
    sendAccessRequestRejected: jest.Mock;
  };

  const enrichedPending = {
    id: 15,
    userId: 42,
    userEmail: 'student@example.com',
    userFullName: 'Ana López',
    userLocale: 'es',
    userEmailVerifiedAt: new Date('2026-11-15T10:00:00Z'),
    userCurrentTier: null,
    requestType: 'subscription' as const,
    requestedTier: 'dolly_plus',
    currentTier: null,
    userMessage: 'Quiero practicar francés',
    status: 'approved' as const,
    rejectionReason: null,
    reviewedByUserId: 1,
    reviewedAt: new Date('2026-11-16T12:00:00Z'),
    createdAt: new Date('2026-11-16T11:00:00Z'),
    updatedAt: new Date('2026-11-16T12:00:00Z'),
  };

  beforeEach(async () => {
    dbMock = {
      select: jest.fn(),
      update: jest.fn(),
      transaction: jest.fn(),
    };
    mailMock = {
      sendAccessRequestApproved: jest.fn().mockResolvedValue(undefined),
      sendAccessRequestRejected: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DRIZZLE, useValue: dbMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  it('approves a subscription request atomically and sends approval email', async () => {
    const txUpdateUsersWhere = jest.fn().mockResolvedValue(undefined);
    const txUpdateUsersSet = jest.fn().mockReturnValue({ where: txUpdateUsersWhere });
    const txClaimReturning = jest.fn().mockResolvedValue([
      {
        id: 15,
        userId: 42,
        requestType: 'subscription',
        requestedTier: 'dolly_plus',
        status: 'approved',
      },
    ]);
    const txClaimWhere = jest.fn().mockReturnValue({ returning: txClaimReturning });
    const txClaimSet = jest.fn().mockReturnValue({ where: txClaimWhere });

    const tx = {
      update: jest
        .fn()
        .mockReturnValueOnce({ set: txClaimSet })
        .mockReturnValueOnce({ set: txUpdateUsersSet }),
      insert: jest.fn(),
    };

    dbMock.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([enrichedPending]),
          }),
        }),
      }),
    });

    const result = await service.approveRequest(1, 15);

    expect(result.emailSent).toBe(true);
    expect(result.request.status).toBe('approved');
    expect(txUpdateUsersSet).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionTier: 'dolly_plus' }),
    );
    expect(mailMock.sendAccessRequestApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@example.com',
        requestType: 'subscription',
        planName: 'Dolly Plus',
        locale: 'es',
      }),
    );
  });

  it('still succeeds when approval email fails and reports emailSent: false', async () => {
    const tx = {
      update: jest.fn().mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 15,
                userId: 42,
                requestType: 'language_unlock',
                requestedTier: null,
                status: 'approved',
              },
            ]),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    dbMock.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest
              .fn()
              .mockResolvedValue([
                { ...enrichedPending, requestType: 'language_unlock', requestedTier: null },
              ]),
          }),
        }),
      }),
    });
    mailMock.sendAccessRequestApproved.mockRejectedValueOnce(new Error('SMTP timeout'));

    const result = await service.approveRequest(1, 15);

    expect(result.emailSent).toBe(false);
    expect(tx.insert).toHaveBeenCalled();
  });

  it('rejects a request with a mandatory reason and emails the reason to the user', async () => {
    dbMock.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest
            .fn()
            .mockResolvedValue([
              { id: 15, status: 'rejected', rejectionReason: 'Motivo detallado' },
            ]),
        }),
      }),
    });
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              {
                ...enrichedPending,
                status: 'rejected',
                rejectionReason: 'Motivo detallado',
              },
            ]),
          }),
        }),
      }),
    });

    const result = await service.rejectRequest(1, 15, '  Motivo detallado  ');

    expect(result.emailSent).toBe(true);
    expect(result.request.status).toBe('rejected');
    expect(mailMock.sendAccessRequestRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@example.com',
        reason: 'Motivo detallado',
      }),
    );
  });

  it('throws ACCESS_REQUEST_ALREADY_REVIEWED when rejecting an already processed request', async () => {
    dbMock.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ id: 15, status: 'approved' }]),
        }),
      }),
    });

    await expect(service.rejectRequest(1, 15, 'Valid rejection reason')).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.ACCESS_REQUEST_ALREADY_REVIEWED }),
    });
  });

  it('getUserDetail returns the user summary and requests or throws RESOURCE_NOT_FOUND', async () => {
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              {
                id: 42,
                email: 'student@example.com',
                fullName: 'Ana López',
                roleName: 'student',
                subscriptionTier: 'dolly_plus',
                emailVerifiedAt: new Date('2026-11-15T10:00:00Z'),
                locale: 'es',
                createdAt: new Date('2026-11-01T10:00:00Z'),
              },
            ]),
          }),
        }),
      }),
    });
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([enrichedPending]),
            }),
          }),
        }),
      }),
    });

    const detail = await service.getUserDetail(42);
    expect(detail.user.email).toBe('student@example.com');
    expect(detail.user.pendingRequestsCount).toBe(0);
    expect(detail.requests).toHaveLength(1);

    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    await expect(service.getUserDetail(999999)).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.RESOURCE_NOT_FOUND }),
    });
  });

  it('listAuditLogs returns paginated items and total count', async () => {
    const sampleRow = {
      id: 1,
      requestId: 'req-abc',
      module: 'users',
      action: 'UPDATE',
      event: 'user.profile_updated',
      summary: 'Updated profile',
      createdAt: new Date('2026-11-16T10:00:00Z'),
    };
    dbMock.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue([sampleRow]),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: 1 }]),
        }),
      });

    const result = await service.listAuditLogs({
      module: 'users',
      action: 'UPDATE',
      from: '2026-11-01',
      to: '2026-11-16',
      limit: 25,
      offset: 0,
    });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.limit).toBe(25);
  });

  it('getAuditLogById and getErrorLogById throw RESOURCE_NOT_FOUND when missing', async () => {
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    await expect(service.getAuditLogById(999)).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.RESOURCE_NOT_FOUND }),
    });

    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    await expect(service.getErrorLogById(999)).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.RESOURCE_NOT_FOUND }),
    });
  });

  it('getRequestTrace aggregates audit, error and prompt logs chronologically', async () => {
    dbMock.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([{ id: 1, requestId: 'req-trace-1' }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([{ id: 2, requestId: 'req-trace-1' }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([{ id: 3, requestId: 'req-trace-1' }]),
          }),
        }),
      });

    const trace = await service.getRequestTrace('req-trace-1');
    expect(trace.requestId).toBe('req-trace-1');
    expect(trace.auditLogs).toHaveLength(1);
    expect(trace.errorLogs).toHaveLength(1);
    expect(trace.promptLogs).toHaveLength(1);
  });
});
