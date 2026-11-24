import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { isPgUniqueViolation } from '../../common/errors/pg-errors';
import { buildFrontendUrl, FRONTEND_FRIEND_INVITE_PATH } from '../mail/mail.constants';
import { MailService } from '../mail/mail.service';
import { isMailLocale, type MailLocale } from '../mail/mail.types';
import { AuditLogService } from '../logs';
import { AppConfigService } from '../../config/env.config';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb, DrizzleExecutor } from '../../database/database.module';
import {
  friendInviteLinks,
  friendships,
  friendStreaks,
  moderatedCategories,
  readings,
  userSettings,
  userBlocks,
  users,
} from '../../database/drizzle/schema';
import type { FriendInviteLink, Friendship } from '../../database/drizzle/types';
import { UsersService, type UserWithRole } from '../users/users.service';
import { isValidSubscriptionTier } from '../subscriptions/subscriptions.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { canonicalCategoryKey, cleanCategoryDisplayName } from '../moderation/category-normalizer';
import type {
  BlockedUserDto,
  FriendUserDto,
  FriendshipDto,
  FriendshipRequestDto,
  InviteLinkDto,
  InviteLinkPreviewDto,
  CopyFriendCategoriesDto,
  CopyFriendCategoriesResultDto,
  FriendCategoryDto,
  FriendReadingCopyDto,
  FriendReadingDto,
} from './dto/friendship.dto';

const INVITE_TTL_DAYS = 7;
const MAX_FRIENDS = 200;
const MAX_PENDING_OUTGOING_REQUESTS = 20;

/** Servicio de solicitudes, relaciones, enlaces y bloqueos de amistad. */
@Injectable()
export class FriendshipsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
    @Optional() private readonly subscriptions?: SubscriptionsService,
    @Optional() private readonly mail?: MailService,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

  /** Verifica que la cuenta pueda participar en funcionalidades sociales. */
  private isEligibleUser(user: UserWithRole | null): user is UserWithRole {
    return Boolean(
      user?.role === 'student' &&
      !user.deletedAt &&
      user.emailVerifiedAt &&
      isValidSubscriptionTier(user.subscriptionTier),
    );
  }

  private async requireActiveFriendship(userId: number, friendUserId: number): Promise<void> {
    await this.requireEligibleUser(userId);
    const friend = await this.users.findById(friendUserId);
    if (!this.isEligibleUser(friend)) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    this.assertDifferentUsers(userId, friendUserId);
    await this.assertNotBlocked(userId, friendUserId);
    if (!(await this.findActiveFriendship(userId, friendUserId))) {
      throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    }
  }

  private toFriendReadingDto(row: typeof readings.$inferSelect): FriendReadingDto {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      category: row.category,
      difficulty: row.difficulty,
      language: row.language,
      wordCount: row.wordCount,
      createdAt: row.createdAt,
    };
  }

  async listFriendReadings(
    userId: number,
    friendUserId: number,
    limit = 20,
  ): Promise<FriendReadingDto[]> {
    await this.requireActiveFriendship(userId, friendUserId);
    const rows = await this.db
      .select()
      .from(readings)
      .where(
        and(
          eq(readings.userId, friendUserId),
          eq(readings.originType, 'personal'),
          isNull(readings.deletedAt),
        ),
      )
      .orderBy(desc(readings.createdAt), desc(readings.id))
      .limit(limit);
    return rows.map((row) => this.toFriendReadingDto(row));
  }

  async getFriendReading(
    userId: number,
    friendUserId: number,
    readingId: number,
  ): Promise<FriendReadingDto> {
    await this.requireActiveFriendship(userId, friendUserId);
    const rows = await this.db
      .select()
      .from(readings)
      .where(
        and(
          eq(readings.id, readingId),
          eq(readings.userId, friendUserId),
          eq(readings.originType, 'personal'),
          isNull(readings.deletedAt),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND, { resource: 'Reading' });
    return this.toFriendReadingDto(row);
  }

  async startFriendReading(
    userId: number,
    friendUserId: number,
    sourceReadingId: number,
  ): Promise<FriendReadingCopyDto> {
    await this.requireActiveFriendship(userId, friendUserId);
    const sourceRows = await this.db
      .select()
      .from(readings)
      .where(
        and(
          eq(readings.id, sourceReadingId),
          eq(readings.userId, friendUserId),
          eq(readings.originType, 'personal'),
          isNull(readings.deletedAt),
        ),
      )
      .limit(1);
    const source = sourceRows[0];
    if (!source)
      throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND, { resource: 'Reading' });

    const existingRows = await this.db
      .select({ id: readings.id })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          eq(readings.sourceReadingId, sourceReadingId),
          isNull(readings.deletedAt),
        ),
      )
      .limit(1);
    if (existingRows[0])
      return { readingId: existingRows[0].id, sourceReadingId, originType: 'friend_copy' };

    try {
      const inserted = await this.db
        .insert(readings)
        .values({
          userId,
          originType: 'friend_copy',
          sourceReadingId,
          title: source.title,
          description: source.description,
          content: source.content,
          category: source.category,
          difficulty: source.difficulty,
          language: source.language,
          wordCount: source.wordCount,
          status: 'pending',
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: readings.id });
      const row = inserted[0];
      if (row) return { readingId: row.id, sourceReadingId, originType: 'friend_copy' };
    } catch (error) {
      if (!isPgUniqueViolation(error)) throw error;
    }
    const retry = await this.db
      .select({ id: readings.id })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          eq(readings.sourceReadingId, sourceReadingId),
          isNull(readings.deletedAt),
        ),
      )
      .limit(1);
    if (!retry[0]) throw new Error('Friend reading copy insert returned no row');
    return { readingId: retry[0].id, sourceReadingId, originType: 'friend_copy' };
  }

  async listFriendCategories(userId: number, friendUserId: number): Promise<FriendCategoryDto[]> {
    await this.requireActiveFriendship(userId, friendUserId);
    const row = await this.settingsRow(friendUserId);
    const library = this.mergeCategories(
      row?.savedCategories ?? [],
      row?.preferredCategories ?? [],
    );
    return this.approvedCategories(library);
  }

  async copyFriendCategories(
    userId: number,
    friendUserId: number,
    dto: CopyFriendCategoriesDto,
  ): Promise<CopyFriendCategoriesResultDto> {
    await this.requireActiveFriendship(userId, friendUserId);
    const friendRow = await this.settingsRow(friendUserId);
    const friendLibrary = this.mergeCategories(
      friendRow?.savedCategories ?? [],
      friendRow?.preferredCategories ?? [],
    );
    const requested = this.mergeCategories([], dto.categories);
    const approved = await this.approvedCategories(friendLibrary);
    const approvedByKey = new Map(approved.map((item) => [item.canonicalKey, item.category]));
    const selected = requested
      .map((item) => approvedByKey.get(canonicalCategoryKey(item)))
      .filter((item): item is string => Boolean(item));
    if (selected.length !== requested.length)
      throw new AppHttpException(ErrorCode.FRIEND_STREAK_CATEGORIES_INVALID, {
        message: 'Only approved categories from this friend can be copied.',
      });

    if (!this.subscriptions) throw new Error('SubscriptionsService is not configured');
    const plan = await this.subscriptions.assertSubscriptionActive(userId);
    const currentRow = await this.settingsRow(userId);
    const currentSelected = currentRow?.preferredCategories ?? [];
    const currentLibrary = this.mergeCategories(currentRow?.savedCategories ?? [], currentSelected);
    const mergedLibrary = this.mergeCategories(currentLibrary, selected);
    const available =
      plan.maxCategories === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, plan.maxCategories - currentSelected.length);
    const activated: string[] = [];
    for (const category of selected) {
      const alreadySelected = currentSelected.some(
        (item) => canonicalCategoryKey(item) === canonicalCategoryKey(category),
      );
      if (alreadySelected || activated.length < available) activated.push(category);
    }
    const nextSelected = this.mergeCategories([], [...currentSelected, ...activated]);
    await this.db
      .insert(userSettings)
      .values({
        userId,
        preferredCategories: nextSelected,
        savedCategories: mergedLibrary,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          preferredCategories: nextSelected,
          savedCategories: mergedLibrary,
          updatedAt: new Date(),
        },
      });
    return {
      activated: selected.filter((item) =>
        nextSelected.some(
          (current) => canonicalCategoryKey(current) === canonicalCategoryKey(item),
        ),
      ),
      savedOnly: selected.filter(
        (item) =>
          !nextSelected.some(
            (current) => canonicalCategoryKey(current) === canonicalCategoryKey(item),
          ),
      ),
    };
  }

  private async settingsRow(userId: number): Promise<typeof userSettings.$inferSelect | undefined> {
    const rows = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return rows[0];
  }

  private mergeCategories(first: readonly string[], second: readonly string[]): string[] {
    const map = new Map<string, string>();
    for (const raw of [...first, ...second]) {
      const cleaned = cleanCategoryDisplayName(raw);
      const key = canonicalCategoryKey(cleaned);
      if (key) map.set(key, cleaned);
    }
    return [...map.values()];
  }

  private async approvedCategories(categories: readonly string[]): Promise<FriendCategoryDto[]> {
    const keys = categories.map(canonicalCategoryKey).filter(Boolean);
    if (!keys.length) return [];
    const rows = await this.db
      .select({
        canonicalKey: moderatedCategories.canonicalKey,
        sampleCategory: moderatedCategories.sampleCategory,
      })
      .from(moderatedCategories)
      .where(
        and(inArray(moderatedCategories.canonicalKey, keys), eq(moderatedCategories.allowed, true)),
      );
    const byKey = new Map(rows.map((row) => [row.canonicalKey, row.sampleCategory]));
    return categories
      .map((category) => {
        const key = canonicalCategoryKey(category);
        const approved = byKey.get(key);
        return approved ? { category, canonicalKey: key } : null;
      })
      .filter((item): item is FriendCategoryDto => item !== null);
  }

  /** Verifica que la cuenta pueda participar en funcionalidades sociales. */
  private async requireEligibleUser(userId: number): Promise<UserWithRole> {
    const user = await this.users.findById(userId);
    if (!this.isEligibleUser(user)) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
        message: 'Only verified students with an active subscription can use friendships.',
      });
    }
    return user;
  }

  /** Impide acciones contra la propia cuenta. */
  private assertDifferentUsers(userId: number, otherUserId: number): void {
    if (userId === otherUserId) {
      throw new AppHttpException(ErrorCode.FRIENDSHIP_SELF_ACTION_NOT_ALLOWED);
    }
  }

  /** Devuelve la pareja ordenada para consultar rachas y bloqueos de forma estable. */
  private orderedPair(userId: number, otherUserId: number): [number, number] {
    return userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  }

  /** Comprueba bloqueos en ambos sentidos. */
  private async assertNotBlocked(
    userId: number,
    otherUserId: number,
    dbClient: DrizzleExecutor = this.db,
  ): Promise<void> {
    const rows = await dbClient
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherUserId)),
          and(eq(userBlocks.blockerId, otherUserId), eq(userBlocks.blockedId, userId)),
        ),
      )
      .limit(1);
    if (rows[0]) throw new AppHttpException(ErrorCode.FRIENDSHIP_USER_BLOCKED);
  }

  /** Aplica el límite razonable de amistades aceptadas por cuenta. */
  private async assertFriendLimit(
    userId: number,
    dbClient: DrizzleExecutor = this.db,
  ): Promise<void> {
    const rows = await dbClient
      .select({ count: sql<number>`count(*)::int` })
      .from(friendships)
      .where(
        and(
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
          eq(friendships.status, 'accepted'),
        ),
      );
    if ((rows[0]?.count ?? 0) >= MAX_FRIENDS) {
      throw new AppHttpException(ErrorCode.FRIENDSHIP_LIMIT_REACHED);
    }
  }

  /** Bloquea ambas filas de usuario en un orden fijo para evitar carreras y deadlocks. */
  private async lockUserPair(
    firstUserId: number,
    secondUserId: number,
    tx: DrizzleExecutor,
  ): Promise<void> {
    const [low, high] = this.orderedPair(firstUserId, secondUserId);
    await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [low, high]))
      .orderBy(asc(users.id))
      .for('update');
  }

  /** Convierte una fila de amistad y el usuario opuesto en una vista pública. */
  private toFriendDto(
    row: Friendship,
    friend: Pick<UserWithRole, 'id' | 'fullName'>,
  ): FriendshipDto {
    return {
      id: row.id,
      friend: this.toFriendUser(friend, row.createdAt),
      createdAt: row.createdAt,
    };
  }

  /** Proyecta únicamente datos públicos del amigo. */
  private toFriendUser(user: Pick<UserWithRole, 'id' | 'fullName'>, since: Date): FriendUserDto {
    return { id: user.id, fullName: user.fullName ?? 'Doly student', since };
  }

  /** Devuelve el idioma de correo permitido o español como respaldo. */
  private mailLocale(user: UserWithRole): MailLocale {
    return isMailLocale(user.locale) ? user.locale : 'es';
  }

  /** Crea una solicitud por correo para una cuenta existente y elegible. */
  async createRequest(userId: number, email: string): Promise<FriendshipRequestDto> {
    const requester = await this.requireEligibleUser(userId);
    const addressee = await this.users.findByEmailInsensitive(email);
    if (!this.isEligibleUser(addressee)) {
      // Deliberately use one safe response for nonexistent and ineligible accounts.
      throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND, {
        message: 'The requested student is not eligible for a friendship invitation.',
      });
    }
    this.assertDifferentUsers(userId, addressee.id);
    let created: Friendship;
    try {
      created = await this.db.transaction(async (tx) => {
        await this.lockUserPair(userId, addressee.id, tx);
        await this.assertNotBlocked(userId, addressee.id, tx);
        await this.assertFriendLimit(userId, tx);

        const outgoingCount = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(friendships)
          .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending')));
        if ((outgoingCount[0]?.count ?? 0) >= MAX_PENDING_OUTGOING_REQUESTS) {
          throw new AppHttpException(ErrorCode.FRIENDSHIP_LIMIT_REACHED);
        }

        const existing = await tx
          .select()
          .from(friendships)
          .where(
            and(
              or(
                and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, addressee.id)),
                and(eq(friendships.requesterId, addressee.id), eq(friendships.addresseeId, userId)),
              ),
              or(eq(friendships.status, 'pending'), eq(friendships.status, 'accepted')),
            ),
          )
          .limit(1);
        if (existing[0]?.status === 'accepted') {
          throw new AppHttpException(ErrorCode.FRIENDSHIP_ALREADY_EXISTS);
        }
        if (existing[0]?.status === 'pending') {
          throw new AppHttpException(ErrorCode.FRIENDSHIP_REQUEST_ALREADY_PENDING);
        }

        const rows = await tx
          .insert(friendships)
          .values({
            requesterId: userId,
            addresseeId: addressee.id,
            origin: 'email',
            status: 'pending',
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Friendship request insert returned no row');
        return row;
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppHttpException(ErrorCode.FRIENDSHIP_REQUEST_ALREADY_PENDING);
      }
      throw error;
    }

    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.requested',
      entityType: 'friendships',
      entityId: created.id,
      actorUserId: requester.id,
      actorEmail: requester.email,
      actorRole: requester.role,
      targetUserId: addressee.id,
      summary: `Friendship request #${created.id} created`,
      metadata: { origin: created.origin },
    });

    try {
      await this.mail?.sendFriendRequestNotice({
        to: addressee.email,
        fullName: addressee.fullName,
        requesterName: requester.fullName ?? 'A Doly student',
        requestId: created.id,
        locale: this.mailLocale(addressee),
      });
    } catch {
      // The relationship is already persisted; mail delivery is recorded by MailService.
    }

    return this.toRequestDto(created, addressee, 'outgoing');
  }

  /** Proyecta una solicitud para una de las partes sin exponer datos innecesarios. */
  private toRequestDto(
    row: Friendship,
    other: UserWithRole,
    direction: 'incoming' | 'outgoing',
  ): FriendshipRequestDto {
    return {
      ...this.toFriendUser(other, row.createdAt),
      requestId: row.id,
      direction,
      origin: row.origin,
      createdAt: row.createdAt,
    };
  }

  /** Lista solicitudes recibidas o enviadas por el usuario. */
  async listRequests(
    userId: number,
    direction: 'incoming' | 'outgoing',
  ): Promise<FriendshipRequestDto[]> {
    await this.requireEligibleUser(userId);
    const column = direction === 'incoming' ? friendships.addresseeId : friendships.requesterId;
    const rows = await this.db
      .select()
      .from(friendships)
      .where(and(eq(column, userId), eq(friendships.status, 'pending')))
      .orderBy(desc(friendships.createdAt), desc(friendships.id));
    return Promise.all(
      rows.map(async (row) => {
        const otherId = direction === 'incoming' ? row.requesterId : row.addresseeId;
        const other = await this.users.findById(otherId);
        return other ? this.toRequestDto(row, other, direction) : null;
      }),
    ).then((items) => items.filter((item): item is FriendshipRequestDto => item !== null));
  }

  /** Acepta una solicitud recibida de forma idempotente solo mientras siga pendiente. */
  async acceptRequest(userId: number, requestId: number): Promise<FriendshipDto> {
    const current = await this.requireEligibleUser(userId);
    const accepted = await this.db.transaction(async (tx) => {
      const candidates = await tx
        .select()
        .from(friendships)
        .where(eq(friendships.id, requestId))
        .limit(1);
      const candidate = candidates[0];
      if (!candidate) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
      if (candidate.addresseeId !== userId || candidate.status !== 'pending') {
        throw new AppHttpException(ErrorCode.FRIENDSHIP_REQUEST_NOT_PENDING);
      }

      await this.lockUserPair(userId, candidate.requesterId, tx);
      await this.assertNotBlocked(userId, candidate.requesterId, tx);
      await this.assertFriendLimit(userId, tx);
      await this.assertFriendLimit(candidate.requesterId, tx);

      const rows = await tx
        .update(friendships)
        .set({ status: 'accepted', respondedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(friendships.id, requestId),
            eq(friendships.addresseeId, userId),
            eq(friendships.status, 'pending'),
          ),
        )
        .returning();
      const row = rows[0];
      if (!row) throw new AppHttpException(ErrorCode.FRIENDSHIP_REQUEST_NOT_PENDING);
      return row;
    });
    const friend = await this.users.findById(accepted.requesterId);
    if (!friend) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.accepted',
      entityType: 'friendships',
      entityId: accepted.id,
      actorUserId: current.id,
      targetUserId: friend.id,
      summary: `Friendship request #${accepted.id} accepted`,
    });
    return this.toFriendDto(accepted, friend);
  }

  /** Rechaza una solicitud recibida sin crear una relación activa. */
  async rejectRequest(userId: number, requestId: number): Promise<void> {
    await this.updatePendingRequest(userId, requestId, 'rejected');
  }

  /** Cancela una solicitud pendiente enviada por el usuario. */
  async cancelRequest(userId: number, requestId: number): Promise<void> {
    await this.updatePendingRequest(userId, requestId, 'cancelled', true);
  }

  private async updatePendingRequest(
    userId: number,
    requestId: number,
    status: 'rejected' | 'cancelled',
    requesterOwns = false,
  ): Promise<void> {
    await this.requireEligibleUser(userId);
    const ownerColumn = requesterOwns ? friendships.requesterId : friendships.addresseeId;
    const rows = await this.db
      .update(friendships)
      .set({ status, respondedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(friendships.id, requestId),
          eq(ownerColumn, userId),
          eq(friendships.status, 'pending'),
        ),
      )
      .returning({ id: friendships.id });
    if (rows[0]) {
      await this.auditLogs?.logEvent({
        module: 'friendships',
        action: 'ACTION',
        event: `friendship.${status}`,
        entityType: 'friendships',
        entityId: requestId,
        actorUserId: userId,
        summary: `Friendship request #${requestId} ${status}`,
      });
      return;
    }
    const exists = await this.db
      .select({ id: friendships.id })
      .from(friendships)
      .where(eq(friendships.id, requestId))
      .limit(1);
    throw new AppHttpException(
      exists[0] ? ErrorCode.FRIENDSHIP_REQUEST_NOT_PENDING : ErrorCode.FRIENDSHIP_NOT_FOUND,
    );
  }

  /** Crea un enlace cuyo token claro solo se devuelve en esta respuesta. */
  async createInviteLink(
    userId: number,
    maxUses?: number | null,
  ): Promise<InviteLinkDto & { token: string }> {
    const user = await this.requireEligibleUser(userId);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.db
      .insert(friendInviteLinks)
      .values({
        creatorUserId: user.id,
        tokenHash,
        maxUses: maxUses === undefined ? 1 : maxUses,
        expiresAt,
      })
      .returning();
    const link = rows[0];
    if (!link) throw new Error('Friend invite link insert returned no row');
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.invite_link_created',
      entityType: 'friend_invite_links',
      entityId: link.id,
      actorUserId: user.id,
      targetUserId: user.id,
      summary: `Friend invite link #${link.id} created`,
    });
    return { ...this.toInviteLinkDto(link, token), token };
  }

  /** Lista enlaces creados por el usuario autenticado. */
  async listInviteLinks(userId: number): Promise<InviteLinkDto[]> {
    await this.requireEligibleUser(userId);
    const rows = await this.db
      .select()
      .from(friendInviteLinks)
      .where(eq(friendInviteLinks.creatorUserId, userId))
      .orderBy(desc(friendInviteLinks.createdAt));
    return rows.map((row) => this.toInviteLinkDto(row));
  }

  private toInviteLinkDto(link: FriendInviteLink, token?: string): InviteLinkDto {
    return {
      id: link.id,
      url: token
        ? buildFrontendUrl(this.config.mail.frontendBaseUrl, FRONTEND_FRIEND_INVITE_PATH, { token })
        : null,
      maxUses: link.maxUses,
      usesCount: link.usesCount,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
    };
  }

  /** Revoca un enlace propio sin borrar el registro de auditoría. */
  async revokeInviteLink(userId: number, linkId: number): Promise<void> {
    await this.requireEligibleUser(userId);
    const rows = await this.db
      .update(friendInviteLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(friendInviteLinks.id, linkId),
          eq(friendInviteLinks.creatorUserId, userId),
          isNull(friendInviteLinks.revokedAt),
        ),
      )
      .returning({ id: friendInviteLinks.id });
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.invite_link_revoked',
      entityType: 'friend_invite_links',
      entityId: linkId,
      actorUserId: userId,
      summary: `Friend invite link #${linkId} revoked`,
    });
  }

  /** Devuelve el preview público mínimo de un enlace. */
  async previewInviteLink(token: string, viewerId?: number): Promise<InviteLinkPreviewDto> {
    const hash = createHash('sha256').update(token).digest('hex');
    const rows = await this.db
      .select({ link: friendInviteLinks, inviter: users })
      .from(friendInviteLinks)
      .innerJoin(users, eq(users.id, friendInviteLinks.creatorUserId))
      .where(eq(friendInviteLinks.tokenHash, hash))
      .limit(1);
    const row = rows[0];
    if (!row) return { inviterName: '', valid: false, expiresAt: null, alreadyFriends: false };
    const inviter = await this.users.findById(row.inviter.id);
    if (!this.isEligibleUser(inviter)) {
      return { inviterName: '', valid: false, expiresAt: null, alreadyFriends: false };
    }
    const valid =
      !row.link.revokedAt &&
      row.link.expiresAt > new Date() &&
      (row.link.maxUses === null || row.link.usesCount < row.link.maxUses);
    let alreadyFriends = false;
    if (viewerId && viewerId !== inviter.id) {
      const friendship = await this.findActiveFriendship(viewerId, inviter.id);
      alreadyFriends = Boolean(friendship);
    }
    return {
      inviterName: inviter.fullName ?? 'Doly student',
      valid,
      expiresAt: row.link.expiresAt,
      alreadyFriends,
    };
  }

  /** Acepta un link y consume un uso dentro de una transacción. */
  async acceptInviteLink(userId: number, token: string): Promise<FriendshipDto> {
    await this.requireEligibleUser(userId);
    const hash = createHash('sha256').update(token).digest('hex');
    const friendship = await this.db.transaction(async (tx) => {
      const links = await tx
        .select({ link: friendInviteLinks, inviter: users })
        .from(friendInviteLinks)
        .innerJoin(users, eq(users.id, friendInviteLinks.creatorUserId))
        .where(eq(friendInviteLinks.tokenHash, hash))
        .limit(1);
      const row = links[0];
      if (!row) throw new AppHttpException(ErrorCode.FRIENDSHIP_INVITE_LINK_INVALID);
      const inviter = await this.users.findById(row.inviter.id);
      if (!this.isEligibleUser(inviter)) {
        throw new AppHttpException(ErrorCode.FRIENDSHIP_INVITE_LINK_INVALID);
      }
      this.assertDifferentUsers(userId, row.inviter.id);
      await this.lockUserPair(userId, row.inviter.id, tx);
      await this.assertNotBlocked(userId, row.inviter.id, tx);
      const valid =
        !row.link.revokedAt &&
        row.link.expiresAt > new Date() &&
        (row.link.maxUses === null || row.link.usesCount < row.link.maxUses);
      if (!valid) throw new AppHttpException(ErrorCode.FRIENDSHIP_INVITE_LINK_INVALID);

      const existing = await tx
        .select()
        .from(friendships)
        .where(
          and(
            or(
              and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, row.inviter.id)),
              and(eq(friendships.requesterId, row.inviter.id), eq(friendships.addresseeId, userId)),
            ),
            or(eq(friendships.status, 'pending'), eq(friendships.status, 'accepted')),
          ),
        )
        .limit(1);
      if (existing[0]?.status === 'accepted') {
        throw new AppHttpException(ErrorCode.FRIENDSHIP_ALREADY_EXISTS);
      }
      if (existing[0]?.status === 'pending') {
        throw new AppHttpException(ErrorCode.FRIENDSHIP_REQUEST_ALREADY_PENDING);
      }
      await this.assertFriendLimit(userId, tx);
      await this.assertFriendLimit(inviter.id, tx);
      const updatedLinks = await tx
        .update(friendInviteLinks)
        .set({ usesCount: sql`${friendInviteLinks.usesCount} + 1` })
        .where(
          and(
            eq(friendInviteLinks.id, row.link.id),
            isNull(friendInviteLinks.revokedAt),
            sql`${friendInviteLinks.expiresAt} > CURRENT_TIMESTAMP`,
            sql`(${friendInviteLinks.maxUses} IS NULL OR ${friendInviteLinks.usesCount} < ${friendInviteLinks.maxUses})`,
          ),
        )
        .returning({ id: friendInviteLinks.id });
      if (!updatedLinks[0]) throw new AppHttpException(ErrorCode.FRIENDSHIP_INVITE_LINK_INVALID);
      const inserted = await tx
        .insert(friendships)
        .values({
          requesterId: row.inviter.id,
          addresseeId: userId,
          origin: 'invite_link',
          status: 'accepted',
          respondedAt: new Date(),
        })
        .returning();
      const friendship = inserted[0];
      if (!friendship) throw new Error('Friendship insert returned no row');
      return this.toFriendDto(friendship, inviter);
    });
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.invite_link_accepted',
      entityType: 'friendships',
      entityId: friendship.id,
      actorUserId: userId,
      targetUserId: friendship.friend.id,
      summary: `Friendship #${friendship.id} accepted through invite link`,
    });
    return friendship;
  }

  /** Declina un enlace sin consumirlo. */
  async declineInviteLink(userId: number, token: string): Promise<void> {
    await this.requireEligibleUser(userId);
    const hash = createHash('sha256').update(token).digest('hex');
    const link = await this.db
      .select({ creatorUserId: friendInviteLinks.creatorUserId })
      .from(friendInviteLinks)
      .where(eq(friendInviteLinks.tokenHash, hash))
      .limit(1);
    const creator = link[0]?.creatorUserId;
    if (!creator) throw new AppHttpException(ErrorCode.FRIENDSHIP_INVITE_LINK_INVALID);
    this.assertDifferentUsers(userId, creator);
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.invite_link_declined',
      entityType: 'friend_invite_links',
      actorUserId: userId,
      targetUserId: creator,
      summary: `Friend invite link declined by user #${userId}`,
    });
  }

  /** Busca una amistad activa sin revelar solicitudes rechazadas o canceladas. */
  private async findActiveFriendship(
    userId: number,
    otherUserId: number,
  ): Promise<Friendship | null> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          or(
            and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, otherUserId)),
            and(eq(friendships.requesterId, otherUserId), eq(friendships.addresseeId, userId)),
          ),
          eq(friendships.status, 'accepted'),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Lista las amistades aceptadas del usuario. */
  async listFriends(userId: number): Promise<FriendshipDto[]> {
    await this.requireEligibleUser(userId);
    const rows = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
          eq(friendships.status, 'accepted'),
        ),
      )
      .orderBy(desc(friendships.createdAt));
    return Promise.all(
      rows.map(async (row) => {
        const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId;
        const friend = await this.users.findById(otherId);
        return friend ? this.toFriendDto(row, friend) : null;
      }),
    ).then((items) => items.filter((item): item is FriendshipDto => item !== null));
  }

  /** Elimina una amistad aceptada entre el usuario y su amigo. */
  async removeFriend(userId: number, friendUserId: number): Promise<void> {
    await this.requireEligibleUser(userId);
    this.assertDifferentUsers(userId, friendUserId);
    const rows = await this.db
      .delete(friendships)
      .where(
        and(
          or(
            and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, friendUserId)),
            and(eq(friendships.requesterId, friendUserId), eq(friendships.addresseeId, userId)),
          ),
          eq(friendships.status, 'accepted'),
        ),
      )
      .returning({ id: friendships.id });
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.removed',
      entityType: 'friendships',
      entityId: rows[0].id,
      actorUserId: userId,
      targetUserId: friendUserId,
      summary: `Friendship #${rows[0].id} removed`,
    });
  }

  /** Bloquea a un usuario y elimina solicitudes, amistad y rachas compartidas. */
  async blockUser(userId: number, blockedUserId: number): Promise<void> {
    await this.requireEligibleUser(userId);
    const blocked = await this.users.findById(blockedUserId);
    if (blocked?.role !== 'student' || blocked?.deletedAt) {
      throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    }
    this.assertDifferentUsers(userId, blockedUserId);
    await this.db.transaction(async (tx) => {
      await this.lockUserPair(userId, blockedUserId, tx);
      await tx
        .insert(userBlocks)
        .values({ blockerId: userId, blockedId: blockedUserId })
        .onConflictDoNothing();
      const [low, high] = this.orderedPair(userId, blockedUserId);
      await tx
        .update(friendStreaks)
        .set({ status: 'ended', updatedAt: new Date() })
        .where(
          and(
            eq(friendStreaks.userLowId, low),
            eq(friendStreaks.userHighId, high),
            sql`${friendStreaks.status} <> 'ended'`,
          ),
        );
      await tx
        .update(friendships)
        .set({ status: 'cancelled', respondedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            or(
              and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, blockedUserId)),
              and(eq(friendships.requesterId, blockedUserId), eq(friendships.addresseeId, userId)),
            ),
            or(eq(friendships.status, 'pending'), eq(friendships.status, 'accepted')),
          ),
        );
    });
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.blocked',
      entityType: 'user_blocks',
      actorUserId: userId,
      targetUserId: blockedUserId,
      summary: `User #${blockedUserId} blocked by user #${userId}`,
    });
  }

  /** Lista usuarios bloqueados por el usuario actual. */
  async listBlocks(userId: number): Promise<BlockedUserDto[]> {
    await this.requireEligibleUser(userId);
    const rows = await this.db
      .select({ block: userBlocks, user: users })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, userId))
      .orderBy(desc(userBlocks.createdAt));
    return rows.map(({ block, user }) => ({
      id: user.id,
      fullName: user.fullName ?? 'Doly student',
      createdAt: block.createdAt,
    }));
  }

  /** Retira un bloqueo creado por el usuario actual. */
  async unblockUser(userId: number, blockedUserId: number): Promise<void> {
    await this.requireEligibleUser(userId);
    const rows = await this.db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, blockedUserId)))
      .returning({ id: userBlocks.id });
    if (!rows[0]) throw new AppHttpException(ErrorCode.FRIENDSHIP_NOT_FOUND);
    await this.auditLogs?.logEvent({
      module: 'friendships',
      action: 'ACTION',
      event: 'friendship.unblocked',
      entityType: 'user_blocks',
      entityId: rows[0].id,
      actorUserId: userId,
      targetUserId: blockedUserId,
      summary: `User #${blockedUserId} unblocked by user #${userId}`,
    });
  }
}
