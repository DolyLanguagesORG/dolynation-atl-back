import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { isPgUniqueViolation } from '../../common/errors/pg-errors';
import { DEFAULT_UI_LOCALE } from '../../common/types/locale';
import { AppConfigService } from '../../config/env.config';
import type { DrizzleDb } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { accessRequests } from '../../database/drizzle/schema';
import type { AccessRequest } from '../../database/drizzle/types';
import { AuditLogService, ErrorLogService } from '../logs';
import { describeError } from '../mail/mail.errors';
import { MailService } from '../mail/mail.service';
import { isMailLocale, type MailLocale } from '../mail/mail.types';
import { SUPPORTED_LANGUAGE_IDS } from '../settings/settings.constants';
import { SettingsService } from '../settings/settings.service';
import {
  isValidSubscriptionTier,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_TIERS,
} from '../subscriptions/subscriptions.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService, type UserWithRole } from '../users/users.service';
import type {
  AccessRequestItemDto,
  CreateAccessRequestDto,
  MyAccessRequestsResponseDto,
} from './dto/access-request.dto';

/** Resuelve un idioma admitido para el correo y usa el idioma predeterminado si no coincide. */
function resolveMailLocale(locale: string | null | undefined): MailLocale {
  return isMailLocale(locale) ? locale : DEFAULT_UI_LOCALE;
}

/**
 * Servicio que gestiona las solicitudes en lista de espera de los clientes
 * para planes de suscripción y desbloqueos de idioma.
 */
@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: AppConfigService,
    private readonly users: UsersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    @Optional() private readonly auditLogs?: AuditLogService,
    @Optional() private readonly errorLogs?: ErrorLogService,
  ) {}

  /** Indica si el modo de solicitudes administrativas está activo por entorno. */
  isEnabled(): boolean {
    return this.config.accessRequests.enabled;
  }

  /** Proyecta una fila de solicitud al formato público sin campos internos adicionales. */
  private toDto(row: AccessRequest): AccessRequestItemDto {
    return {
      id: row.id,
      userId: row.userId,
      requestType: row.requestType,
      requestedTier: row.requestedTier ?? null,
      currentTier: row.currentTier ?? null,
      userMessage: row.userMessage ?? null,
      status: row.status,
      rejectionReason: row.rejectionReason ?? null,
      reviewedAt: row.reviewedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Devuelve el estado actual de `ACCESS_REQUESTS_ENABLED` y las solicitudes del usuario.
   */
  async getMyRequests(userId: number): Promise<MyAccessRequestsResponseDto> {
    const rows = await this.db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.userId, userId))
      .orderBy(desc(accessRequests.createdAt), desc(accessRequests.id));

    const items = rows.map((row) => this.toDto(row));
    const pendingSubscriptionRequest =
      items.find((item) => item.requestType === 'subscription' && item.status === 'pending') ??
      null;
    const pendingLanguageUnlockRequest =
      items.find((item) => item.requestType === 'language_unlock' && item.status === 'pending') ??
      null;

    return {
      enabled: this.isEnabled(),
      requests: items,
      pendingSubscriptionRequest,
      pendingLanguageUnlockRequest,
    };
  }

  /**
   * Crea una nueva solicitud de acceso (`subscription` o `language_unlock`) para revisión del administrador.
   */
  async createRequest(userId: number, dto: CreateAccessRequestDto): Promise<AccessRequestItemDto> {
    if (!this.isEnabled()) {
      throw new AppHttpException(ErrorCode.ACCESS_REQUESTS_DISABLED);
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }
    if (user.role === 'admin') {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
        message: 'Administrators cannot submit client access requests.',
      });
    }

    const requiresVerifiedEmail =
      this.config.mail.verificationRequired || this.config.nodeEnv === 'production';
    if (requiresVerifiedEmail && !user.emailVerifiedAt) {
      throw new AppHttpException(ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
    }

    const userMessage = dto.message?.trim() ? dto.message.trim() : null;
    let requestedTier: string | null = null;

    if (dto.type === 'subscription') {
      if (!isValidSubscriptionTier(dto.tier)) {
        throw new AppHttpException(ErrorCode.SUBSCRIPTION_INVALID_TIER, {
          tier: dto.tier,
          validTiers: SUBSCRIPTION_TIERS,
        });
      }
      if (user.subscriptionTier === dto.tier) {
        throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
          message: `You already have the '${dto.tier}' subscription active.`,
          requestedTier: dto.tier,
        });
      }
      requestedTier = dto.tier;
    } else {
      const plan = await this.subscriptions.assertSubscriptionActive(userId);
      if (plan.maxLanguages >= SUPPORTED_LANGUAGE_IDS.length) {
        throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
          message: 'Your current subscription already unlocks all supported languages.',
        });
      }
      const langSettings = await this.settings.getLanguagesSettings(userId);
      if (langSettings.canChangeFree) {
        throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
          message: 'You can currently change your study languages without an unlock credit.',
        });
      }
    }

    const existingPending = await this.db
      .select()
      .from(accessRequests)
      .where(
        and(
          eq(accessRequests.userId, userId),
          eq(accessRequests.requestType, dto.type),
          eq(accessRequests.status, 'pending'),
        ),
      )
      .limit(1);

    if (existingPending[0]) {
      throw new AppHttpException(ErrorCode.ACCESS_REQUEST_ALREADY_PENDING, {
        existingRequestId: existingPending[0].id,
        requestType: existingPending[0].requestType,
        requestedTier: existingPending[0].requestedTier,
      });
    }

    const now = new Date();
    let inserted: AccessRequest;
    try {
      const rows = await this.db
        .insert(accessRequests)
        .values({
          userId,
          requestType: dto.type,
          requestedTier,
          currentTier: user.subscriptionTier ?? null,
          userMessage,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const first = rows[0];
      if (!first) {
        throw new Error('Access request insert returned no row');
      }
      inserted = first;
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppHttpException(ErrorCode.ACCESS_REQUEST_ALREADY_PENDING, {
          requestType: dto.type,
        });
      }
      throw error;
    }

    await this.auditLogs?.logCreate({
      module: 'access_requests',
      event: 'access_request.created',
      entityType: 'access_requests',
      entityId: inserted.id,
      actorUserId: userId,
      actorEmail: user.email,
      actorRole: user.role,
      targetUserId: userId,
      summary: `Access request #${inserted.id} (${inserted.requestType}) created by user #${userId}`,
      afterState: { ...this.toDto(inserted) },
    });

    await this.notifyAdminIfConfigured(user, inserted);
    return this.toDto(inserted);
  }

  /**
   * Permite al usuario cancelar su propia solicitud pendiente antes de que sea revisada.
   */
  async cancelRequest(userId: number, requestId: number): Promise<AccessRequestItemDto> {
    const now = new Date();
    const [cancelled] = await this.db
      .update(accessRequests)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(accessRequests.id, requestId),
          eq(accessRequests.userId, userId),
          eq(accessRequests.status, 'pending'),
        ),
      )
      .returning();

    if (cancelled) {
      const dto = this.toDto(cancelled);
      await this.auditLogs?.logUpdate({
        module: 'access_requests',
        event: 'access_request.cancelled',
        entityType: 'access_requests',
        entityId: cancelled.id,
        actorUserId: userId,
        targetUserId: userId,
        summary: `Access request #${cancelled.id} cancelled by user #${userId}`,
        beforeState: {
          ...dto,
          status: 'pending',
          updatedAt: cancelled.createdAt,
        },
        afterState: { ...dto },
      });
      return dto;
    }

    const existingRows = await this.db
      .select({ id: accessRequests.id, status: accessRequests.status })
      .from(accessRequests)
      .where(and(eq(accessRequests.id, requestId), eq(accessRequests.userId, userId)))
      .limit(1);

    if (existingRows[0]) {
      throw new AppHttpException(ErrorCode.ACCESS_REQUEST_ALREADY_REVIEWED, {
        status: existingRows[0].status,
      });
    }

    throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'AccessRequest' });
  }

  /**
   * Envía un aviso opcional al correo del equipo cuando `ADMIN_NOTIFICATION_EMAIL` está configurado.
   * Nunca propaga fallos SMTP para no bloquear la creación de la solicitud.
   */
  private async notifyAdminIfConfigured(user: UserWithRole, request: AccessRequest): Promise<void> {
    const adminEmail = this.config.accessRequests.adminNotificationEmail;
    if (!adminEmail) {
      return;
    }

    const planName =
      request.requestedTier && isValidSubscriptionTier(request.requestedTier)
        ? SUBSCRIPTION_PLANS[request.requestedTier].name
        : request.requestedTier;

    try {
      await this.mail.sendAdminAccessRequestNotice({
        to: adminEmail,
        requesterName: user.fullName ?? null,
        requesterEmail: user.email,
        requestType: request.requestType,
        planName: planName ?? null,
        userMessage: request.userMessage ?? null,
        locale: resolveMailLocale(user.locale),
      });
    } catch (error) {
      const errDesc = describeError(error);
      this.logger.error(`No se pudo enviar el aviso de solicitud al administrador: ${errDesc}`);
      await this.errorLogs?.logError({
        severity: 'error',
        source: 'mail_smtp',
        module: 'access_requests',
        errorCode: 'MAIL_DELIVERY_ERROR',
        message: `Failed to send admin access request notice for #${request.id}: ${errDesc}`,
        errorName: error instanceof Error ? error.name : typeof error,
        errorStack: error instanceof Error ? (error.stack ?? null) : null,
        actorUserId: user.id,
        actorEmail: user.email,
      });
    }
  }
}
