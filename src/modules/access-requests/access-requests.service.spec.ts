import { Test } from '@nestjs/testing';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/env.config';
import { DRIZZLE } from '../../database/database.tokens';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { SUBSCRIPTION_PLANS } from '../subscriptions/subscriptions.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { AccessRequestsService } from './access-requests.service';

describe('AccessRequestsService', () => {
  let service: AccessRequestsService;
  let dbMock: { select: jest.Mock; insert: jest.Mock; update: jest.Mock };
  let usersMock: { findById: jest.Mock };
  let subscriptionsMock: { assertSubscriptionActive: jest.Mock };
  let settingsMock: { getLanguagesSettings: jest.Mock };
  let mailMock: { sendAdminAccessRequestNotice: jest.Mock };
  let enabled: boolean;
  let verificationRequired: boolean;
  let adminNotificationEmail: string | undefined;

  const baseStudent = {
    id: 42,
    email: 'student@example.com',
    fullName: 'Student Name',
    password: 'hash',
    roleId: 1,
    role: 'student' as const,
    subscriptionTier: null as string | null,
    currentStreak: 0,
    lastStreakDate: null,
    emailVerifiedAt: new Date('2026-11-15T10:00:00Z'),
    locale: 'es',
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    enabled = true;
    verificationRequired = true;
    adminNotificationEmail = undefined;

    dbMock = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    usersMock = {
      findById: jest.fn().mockResolvedValue(baseStudent),
    };
    subscriptionsMock = {
      assertSubscriptionActive: jest.fn().mockResolvedValue(SUBSCRIPTION_PLANS.dolly),
    };
    settingsMock = {
      getLanguagesSettings: jest.fn().mockResolvedValue({
        canChangeFree: false,
        languageChangeCredits: 0,
      }),
    };
    mailMock = {
      sendAdminAccessRequestNotice: jest.fn().mockResolvedValue(undefined),
    };

    const configMock = {
      nodeEnv: 'development',
      get mail() {
        return { verificationRequired };
      },
      get accessRequests() {
        return { enabled, adminNotificationEmail };
      },
    } as unknown as AppConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccessRequestsService,
        { provide: DRIZZLE, useValue: dbMock },
        { provide: AppConfigService, useValue: configMock },
        { provide: UsersService, useValue: usersMock },
        { provide: SubscriptionsService, useValue: subscriptionsMock },
        { provide: SettingsService, useValue: settingsMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();

    service = moduleRef.get(AccessRequestsService);
  });

  it('throws ACCESS_REQUESTS_DISABLED when ACCESS_REQUESTS_ENABLED is false', async () => {
    enabled = false;
    await expect(
      service.createRequest(42, { type: 'subscription', tier: 'dolly' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.ACCESS_REQUESTS_DISABLED }),
    });
  });

  it('rejects unverified users when email verification is required', async () => {
    usersMock.findById.mockResolvedValue({ ...baseStudent, emailVerifiedAt: null });

    await expect(
      service.createRequest(42, { type: 'subscription', tier: 'dolly' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.AUTH_EMAIL_NOT_VERIFIED }),
    });
  });

  it('rejects requesting the same subscription tier already active', async () => {
    usersMock.findById.mockResolvedValue({ ...baseStudent, subscriptionTier: 'dolly_plus' });

    await expect(
      service.createRequest(42, { type: 'subscription', tier: 'dolly_plus' }),
    ).rejects.toBeInstanceOf(AppHttpException);
  });

  it('creates a pending subscription request and sends optional admin notification', async () => {
    adminNotificationEmail = 'owner@dolynation.test';
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    const insertedRow = {
      id: 7,
      userId: 42,
      requestType: 'subscription',
      requestedTier: 'dolly_plus',
      currentTier: null,
      userMessage: 'Looking forward to practicing French.',
      status: 'pending',
      rejectionReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date('2026-11-16T12:00:00Z'),
      updatedAt: new Date('2026-11-16T12:00:00Z'),
    };
    dbMock.insert.mockReturnValueOnce({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([insertedRow]),
      }),
    });

    const created = await service.createRequest(42, {
      type: 'subscription',
      tier: 'dolly_plus',
      message: '  Looking forward to practicing French.  ',
    });

    expect(created.id).toBe(7);
    expect(created.requestedTier).toBe('dolly_plus');
    expect(created.status).toBe('pending');
    expect(mailMock.sendAdminAccessRequestNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@dolynation.test',
        requesterEmail: 'student@example.com',
        planName: 'Dolly Plus',
        userMessage: 'Looking forward to practicing French.',
      }),
    );
  });

  it('rejects duplicate pending requests with ACCESS_REQUEST_ALREADY_PENDING', async () => {
    dbMock.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockResolvedValue([{ id: 7, requestType: 'subscription', requestedTier: 'dolly' }]),
        }),
      }),
    });

    await expect(
      service.createRequest(42, { type: 'subscription', tier: 'dolly_pro' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.ACCESS_REQUEST_ALREADY_PENDING }),
    });
  });

  it('prevents language_unlock request when user can already change language for free', async () => {
    usersMock.findById.mockResolvedValue({ ...baseStudent, subscriptionTier: 'dolly' });
    settingsMock.getLanguagesSettings.mockResolvedValue({
      canChangeFree: true,
      languageChangeCredits: 0,
    });

    await expect(service.createRequest(42, { type: 'language_unlock' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
    });
  });
});
