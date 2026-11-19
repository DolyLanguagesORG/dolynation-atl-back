import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

describe('AdminController', () => {
  let controller: AdminController;
  let admin: jest.Mocked<
    Pick<
      AdminService,
      | 'listCategories'
      | 'listUsers'
      | 'getUserDetail'
      | 'listPromptLogs'
      | 'listAuditLogs'
      | 'getAuditLogById'
      | 'listErrorLogs'
      | 'getErrorLogById'
      | 'getRequestTrace'
      | 'listRequests'
      | 'approveRequest'
      | 'rejectRequest'
    >
  >;

  const adminUser: AuthUser = {
    id: 1,
    email: 'admin@example.com',
    fullName: 'Admin',
    role: 'admin',
  };

  const sampleRequest = {
    id: 10,
    userId: 42,
    userEmail: 'student@example.com',
    userFullName: 'Student Name',
    userLocale: 'es',
    userEmailVerifiedAt: new Date('2026-11-15T10:00:00Z'),
    userCurrentTier: null,
    requestType: 'subscription' as const,
    requestedTier: 'dolly_plus',
    currentTier: null,
    userMessage: 'Testing beta',
    status: 'pending' as const,
    rejectionReason: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: new Date('2026-11-16T10:00:00Z'),
    updatedAt: new Date('2026-11-16T10:00:00Z'),
  };

  const sampleAuditLog = {
    id: 101,
    requestId: 'req-123',
    actorUserId: 42,
    actorEmail: 'student@example.com',
    actorRole: 'student',
    targetUserId: 42,
    ipAddress: '203.0.113.10',
    userAgent: 'TestBrowser',
    httpMethod: 'PATCH',
    httpPath: '/api/v1/user/profile',
    httpStatus: 200,
    module: 'users',
    action: 'UPDATE' as const,
    event: 'user.profile_updated',
    entityType: 'users',
    entityId: '42',
    summary: 'Profile updated',
    beforeState: { fullName: 'Old' },
    afterState: { fullName: 'New' },
    changedFields: ['fullName'],
    metadata: null,
    durationMs: 12,
    createdAt: new Date('2026-11-16T10:00:00Z'),
  };

  const sampleErrorLog = {
    id: 55,
    requestId: 'req-123',
    severity: 'error' as const,
    source: 'ai_provider',
    module: 'readings',
    errorCode: 'AI_RATE_LIMITED',
    httpStatus: 429,
    message: 'Quota exceeded',
    errorName: 'AppHttpException',
    errorStack: null,
    actorUserId: 42,
    actorEmail: 'student@example.com',
    actorRole: 'student',
    ipAddress: '203.0.113.10',
    userAgent: 'TestBrowser',
    httpMethod: 'POST',
    httpPath: '/api/v1/readings',
    requestBody: { category: 'tech' },
    requestQuery: null,
    details: { reason: 'ai-rate-limited' },
    durationMs: 50,
    createdAt: new Date('2026-11-16T10:01:00Z'),
  };

  beforeEach(async () => {
    admin = {
      listCategories: jest
        .fn()
        .mockReturnValue([{ id: 'technology', name: 'Technology', subcategories: ['AI'] }]),
      listUsers: jest.fn().mockResolvedValue([
        {
          id: 1,
          email: 'a@b.c',
          fullName: 'A B',
          role: 'student',
          subscriptionTier: 'dolly',
          emailVerifiedAt: new Date('2026-10-01T00:00:00Z'),
          locale: 'es',
          pendingRequestsCount: 1,
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
      ]),
      getUserDetail: jest.fn().mockResolvedValue({
        user: {
          id: 42,
          email: 'student@example.com',
          fullName: 'Student Name',
          role: 'student',
          subscriptionTier: null,
          emailVerifiedAt: new Date('2026-11-15T10:00:00Z'),
          locale: 'es',
          pendingRequestsCount: 1,
          createdAt: new Date('2026-11-15T10:00:00Z'),
        },
        requests: [sampleRequest],
      }),
      listPromptLogs: jest.fn().mockResolvedValue([
        {
          id: 128,
          level: 'error',
          event: 'text_generation_failed',
          errorMessage: 'Google request failed: 429 Too Many Requests - quota exceeded',
          message: 'prompt error: text_generation_failed: boom',
          userId: 42,
          createdAt: new Date('2026-11-16T10:00:00Z'),
        },
      ]),
      listAuditLogs: jest.fn().mockResolvedValue({
        items: [sampleAuditLog],
        total: 1,
        limit: 50,
        offset: 0,
      }),
      getAuditLogById: jest.fn().mockResolvedValue(sampleAuditLog),
      listErrorLogs: jest.fn().mockResolvedValue({
        items: [sampleErrorLog],
        total: 1,
        limit: 50,
        offset: 0,
      }),
      getErrorLogById: jest.fn().mockResolvedValue(sampleErrorLog),
      getRequestTrace: jest.fn().mockResolvedValue({
        requestId: 'req-123',
        auditLogs: [sampleAuditLog],
        errorLogs: [sampleErrorLog],
        promptLogs: [],
      }),
      listRequests: jest.fn().mockResolvedValue([sampleRequest]),
      approveRequest: jest.fn().mockResolvedValue({
        request: { ...sampleRequest, status: 'approved', reviewedByUserId: 1 },
        emailSent: true,
      }),
      rejectRequest: jest.fn().mockResolvedValue({
        request: {
          ...sampleRequest,
          status: 'rejected',
          rejectionReason: 'Not enough info',
          reviewedByUserId: 1,
        },
        emailSent: true,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: admin }],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();

    controller = moduleRef.get(AdminController);
  });

  it('GET /admin/categories returns the catalog', () => {
    const result = controller.listCategories();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'technology', name: 'Technology' });
    expect(admin.listCategories).toHaveBeenCalled();
  });

  it('GET /admin/users returns a page of users with roles and pending counts', async () => {
    const result = await controller.listUsers();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 1,
      email: 'a@b.c',
      role: 'student',
      pendingRequestsCount: 1,
    });
    expect(admin.listUsers).toHaveBeenCalled();
  });

  it('GET /admin/users/:id returns the selected user and their requests', async () => {
    const result = await controller.getUserDetail(42);
    expect(result.data.user.id).toBe(42);
    expect(result.data.requests).toHaveLength(1);
    expect(admin.getUserDetail).toHaveBeenCalledWith(42);
  });

  it('GET /admin/prompt-logs returns the recent AI failures', async () => {
    const result = await controller.listPromptLogs();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      event: 'text_generation_failed',
      errorMessage: 'Google request failed: 429 Too Many Requests - quota exceeded',
    });
    expect(admin.listPromptLogs).toHaveBeenCalled();
  });

  it('GET /admin/logs/audit and /admin/logs/audit/:id delegate to AdminService', async () => {
    const listRes = await controller.listAuditLogs({ module: 'users' });
    expect(listRes.data.total).toBe(1);
    expect(listRes.data.items[0]?.event).toBe('user.profile_updated');
    expect(admin.listAuditLogs).toHaveBeenCalledWith({ module: 'users' });

    const detailRes = await controller.getAuditLogDetail(101);
    expect(detailRes.data.id).toBe(101);
    expect(admin.getAuditLogById).toHaveBeenCalledWith(101);
  });

  it('GET /admin/logs/errors and /admin/logs/errors/:id delegate to AdminService', async () => {
    const listRes = await controller.listErrorLogs({ severity: 'error' });
    expect(listRes.data.total).toBe(1);
    expect(listRes.data.items[0]?.errorCode).toBe('AI_RATE_LIMITED');
    expect(admin.listErrorLogs).toHaveBeenCalledWith({ severity: 'error' });

    const detailRes = await controller.getErrorLogDetail(55);
    expect(detailRes.data.id).toBe(55);
    expect(admin.getErrorLogById).toHaveBeenCalledWith(55);
  });

  it('GET /admin/logs/trace/:requestId delegates to AdminService', async () => {
    const traceRes = await controller.getRequestTrace('req-123');
    expect(traceRes.data.requestId).toBe('req-123');
    expect(traceRes.data.auditLogs).toHaveLength(1);
    expect(traceRes.data.errorLogs).toHaveLength(1);
    expect(admin.getRequestTrace).toHaveBeenCalledWith('req-123');
  });

  it('GET /admin/requests returns access requests', async () => {
    const result = await controller.listRequests({ status: 'pending' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 10, requestType: 'subscription' });
    expect(admin.listRequests).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('POST /admin/requests/:id/approve delegates to AdminService', async () => {
    const result = await controller.approveRequest(adminUser, 10);
    expect(result.data.request.status).toBe('approved');
    expect(result.data.emailSent).toBe(true);
    expect(admin.approveRequest).toHaveBeenCalledWith(1, 10);
  });

  it('POST /admin/requests/:id/reject delegates reason to AdminService', async () => {
    const result = await controller.rejectRequest(adminUser, 10, { reason: 'Not enough info' });
    expect(result.data.request.status).toBe('rejected');
    expect(result.data.emailSent).toBe(true);
    expect(admin.rejectRequest).toHaveBeenCalledWith(1, 10, 'Not enough info');
  });
});
