import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { AllowWithoutSubscription } from '../../common/decorators/allow-without-subscription.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import {
  ApiCreatedResponseOf,
  ApiOkResponseEmpty,
  ApiOkResponseOf,
  ApiOkResponseOfArray,
} from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { RateLimitByIp } from '../security';
import { FriendshipsService } from './friendships.service';
import {
  BlockedUserDto,
  CreateFriendRequestDto,
  CreateInviteLinkDto,
  CreatedInviteLinkDto,
  FriendshipDto,
  FriendshipRequestDto,
  InviteLinkDto,
  InviteLinkPreviewDto,
  InviteTokenParamDto,
  CopyFriendCategoriesDto,
  CopyFriendCategoriesResultDto,
  FriendCategoryDto,
  FriendReadingCopyDto,
  FriendReadingDto,
  FriendReadingsQueryDto,
  CreateFriendStreakDto,
  FriendStreakCategoriesDto,
  FriendStreakDto,
} from './dto/friendship.dto';
import { FriendStreakService } from './friend-streak.service';

/** API social de amistades, invitaciones y bloqueos (`/friends`). */
@ApiTags('friends')
@AllowWithoutSubscription()
@ApiUnauthorizedResponse({ description: 'Missing or invalid authentication', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'Account is not eligible for friendships', type: ApiErrorDto })
@ApiTooManyRequestsResponse({
  description: 'Friendship rate or relationship limit exceeded',
  type: ApiErrorDto,
})
@Controller('friends')
export class FriendshipsController {
  constructor(
    private readonly friendships: FriendshipsService,
    private readonly streaks: FriendStreakService,
  ) {}

  /** Envía una solicitud a una cuenta student elegible por correo. */
  @Post('requests/by-email')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @RateLimitByIp({ action: 'friend_request_email', maxRequests: 10, windowMs: 15 * 60_000 })
  @ApiOperation({ summary: 'Send a friendship request by email' })
  @ApiCreatedResponseOf(FriendshipRequestDto)
  @ApiBadRequestResponse({ description: 'Invalid email or account action', type: ApiErrorDto })
  @ApiConflictResponse({ description: 'Friendship request already exists', type: ApiErrorDto })
  async createRequest(
    @CurrentUser() current: AuthUser,
    @Body() dto: CreateFriendRequestDto,
  ): Promise<ApiResponse<FriendshipRequestDto>> {
    return apiOk(
      'Friendship request sent',
      await this.friendships.createRequest(current.id, dto.email),
    );
  }

  /** Lista solicitudes recibidas. */
  @Get('requests/incoming')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List incoming friendship requests' })
  @ApiOkResponseOfArray(FriendshipRequestDto)
  async incomingRequests(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<FriendshipRequestDto[]>> {
    return apiOk(
      'Incoming friendship requests',
      await this.friendships.listRequests(current.id, 'incoming'),
    );
  }

  /** Lista solicitudes enviadas. */
  @Get('requests/outgoing')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List outgoing friendship requests' })
  @ApiOkResponseOfArray(FriendshipRequestDto)
  async outgoingRequests(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<FriendshipRequestDto[]>> {
    return apiOk(
      'Outgoing friendship requests',
      await this.friendships.listRequests(current.id, 'outgoing'),
    );
  }

  /** Acepta una solicitud recibida. */
  @Post('requests/:requestId/accept')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Accept an incoming friendship request' })
  @ApiOkResponseOf(FriendshipDto)
  @ApiNotFoundResponse({ description: 'Friendship request not found', type: ApiErrorDto })
  async acceptRequest(
    @CurrentUser() current: AuthUser,
    @Param('requestId', ParseIntPipe) requestId: number,
  ): Promise<ApiResponse<FriendshipDto>> {
    return apiOk(
      'Friendship request accepted',
      await this.friendships.acceptRequest(current.id, requestId),
    );
  }

  /** Rechaza una solicitud recibida. */
  @Post('requests/:requestId/reject')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an incoming friendship request' })
  @ApiOkResponseEmpty()
  async rejectRequest(
    @CurrentUser() current: AuthUser,
    @Param('requestId', ParseIntPipe) requestId: number,
  ): Promise<ApiResponse<null>> {
    await this.friendships.rejectRequest(current.id, requestId);
    return apiOk('Friendship request rejected', null);
  }

  /** Cancela una solicitud enviada por el usuario actual. */
  @Delete('requests/:requestId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel an outgoing friendship request' })
  @ApiOkResponseEmpty()
  async cancelRequest(
    @CurrentUser() current: AuthUser,
    @Param('requestId', ParseIntPipe) requestId: number,
  ): Promise<ApiResponse<null>> {
    await this.friendships.cancelRequest(current.id, requestId);
    return apiOk('Friendship request cancelled', null);
  }

  /** Crea un enlace compartible y devuelve el token solo una vez. */
  @Post('invite-links')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @RateLimitByIp({ action: 'friend_invite_link_create', maxRequests: 10, windowMs: 15 * 60_000 })
  @ApiOperation({ summary: 'Create a shareable friendship invite link' })
  @ApiCreatedResponseOf(CreatedInviteLinkDto)
  async createInviteLink(
    @CurrentUser() current: AuthUser,
    @Body() dto: CreateInviteLinkDto,
  ): Promise<ApiResponse<CreatedInviteLinkDto>> {
    return apiOk(
      'Friendship invite link created',
      await this.friendships.createInviteLink(current.id, dto.maxUses),
    );
  }

  /** Lista los metadatos de enlaces creados por el usuario. */
  @Get('invite-links')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List your friendship invite links' })
  @ApiOkResponseOfArray(InviteLinkDto)
  async listInviteLinks(@CurrentUser() current: AuthUser): Promise<ApiResponse<InviteLinkDto[]>> {
    return apiOk('Friendship invite links', await this.friendships.listInviteLinks(current.id));
  }

  /** Revoca un enlace propio. */
  @Delete('invite-links/:linkId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a friendship invite link' })
  @ApiOkResponseEmpty()
  async revokeInviteLink(
    @CurrentUser() current: AuthUser,
    @Param('linkId', ParseIntPipe) linkId: number,
  ): Promise<ApiResponse<null>> {
    await this.friendships.revokeInviteLink(current.id, linkId);
    return apiOk('Friendship invite link revoked', null);
  }

  /** Preview público que no expone IDs ni correo del creador. */
  @OptionalAuth()
  @Get('invite-links/:token')
  @RateLimitByIp({ action: 'friend_invite_link_preview', maxRequests: 30, windowMs: 15 * 60_000 })
  @ApiOperation({ summary: 'Preview a friendship invite link' })
  @ApiOkResponseOf(InviteLinkPreviewDto)
  async previewInviteLink(
    @Param() params: InviteTokenParamDto,
    @CurrentUser() current?: AuthUser,
  ): Promise<ApiResponse<InviteLinkPreviewDto>> {
    return apiOk(
      'Friendship invite link preview',
      await this.friendships.previewInviteLink(params.token, current?.id),
    );
  }

  /** Acepta una invitación compartible después de autenticarse. */
  @Post('invite-links/:token/accept')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Accept a friendship invite link' })
  @ApiCreatedResponseOf(FriendshipDto)
  async acceptInviteLink(
    @CurrentUser() current: AuthUser,
    @Param() params: InviteTokenParamDto,
  ): Promise<ApiResponse<FriendshipDto>> {
    return apiOk(
      'Friendship invite accepted',
      await this.friendships.acceptInviteLink(current.id, params.token),
    );
  }

  /** Declina una invitación compartible. */
  @Post('invite-links/:token/decline')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a friendship invite link' })
  @ApiOkResponseEmpty()
  async declineInviteLink(
    @CurrentUser() current: AuthUser,
    @Param() params: InviteTokenParamDto,
  ): Promise<ApiResponse<null>> {
    await this.friendships.declineInviteLink(current.id, params.token);
    return apiOk('Friendship invite declined', null);
  }

  /** Lista amistades aceptadas. */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List accepted friends' })
  @ApiOkResponseOfArray(FriendshipDto)
  async listFriends(@CurrentUser() current: AuthUser): Promise<ApiResponse<FriendshipDto[]>> {
    return apiOk('Friends', await this.friendships.listFriends(current.id));
  }

  @Get(':friendUserId/readings')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List a friend’s personal readings privately' })
  @ApiOkResponseOfArray(FriendReadingDto)
  async listFriendReadings(
    @CurrentUser() current: AuthUser,
    @Param('friendUserId', ParseIntPipe) friendUserId: number,
    @Query() query: FriendReadingsQueryDto,
  ): Promise<ApiResponse<FriendReadingDto[]>> {
    return apiOk(
      'Friend readings',
      await this.friendships.listFriendReadings(current.id, friendUserId, query.limit ?? 20),
    );
  }

  @Get(':friendUserId/readings/:readingId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Open a friend’s personal reading privately' })
  @ApiOkResponseOf(FriendReadingDto)
  async getFriendReading(
    @CurrentUser() current: AuthUser,
    @Param('friendUserId', ParseIntPipe) friendUserId: number,
    @Param('readingId', ParseIntPipe) readingId: number,
  ): Promise<ApiResponse<FriendReadingDto>> {
    return apiOk(
      'Friend reading',
      await this.friendships.getFriendReading(current.id, friendUserId, readingId),
    );
  }

  @Post(':friendUserId/readings/:readingId/start')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @RateLimitByIp({ action: 'friend_reading_start', maxRequests: 30, windowMs: 15 * 60_000 })
  @ApiOperation({ summary: 'Start your private copy of a friend’s reading' })
  @ApiOkResponseOf(FriendReadingCopyDto)
  async startFriendReading(
    @CurrentUser() current: AuthUser,
    @Param('friendUserId', ParseIntPipe) friendUserId: number,
    @Param('readingId', ParseIntPipe) readingId: number,
  ): Promise<ApiResponse<FriendReadingCopyDto>> {
    return apiOk(
      'Friend reading started',
      await this.friendships.startFriendReading(current.id, friendUserId, readingId),
    );
  }

  @Get(':friendUserId/categories')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List approved categories from a friend' })
  @ApiOkResponseOfArray(FriendCategoryDto)
  async listFriendCategories(
    @CurrentUser() current: AuthUser,
    @Param('friendUserId', ParseIntPipe) friendUserId: number,
  ): Promise<ApiResponse<FriendCategoryDto[]>> {
    return apiOk(
      'Friend categories',
      await this.friendships.listFriendCategories(current.id, friendUserId),
    );
  }

  @Post(':friendUserId/categories/copy')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @RateLimitByIp({ action: 'friend_categories_copy', maxRequests: 20, windowMs: 15 * 60_000 })
  @ApiOperation({ summary: 'Copy approved categories from a friend' })
  @ApiOkResponseOf(CopyFriendCategoriesResultDto)
  async copyFriendCategories(
    @CurrentUser() current: AuthUser,
    @Param('friendUserId', ParseIntPipe) friendUserId: number,
    @Body() dto: CopyFriendCategoriesDto,
  ): Promise<ApiResponse<CopyFriendCategoriesResultDto>> {
    return apiOk(
      'Friend categories copied',
      await this.friendships.copyFriendCategories(current.id, friendUserId, dto),
    );
  }

  @Post(':friendUserId/streak')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Propose a daily reading streak to a friend' })
  @ApiCreatedResponseOf(FriendStreakDto)
  async createStreak(
    @CurrentUser() current: AuthUser,
    @Param('friendUserId', ParseIntPipe) friendUserId: number,
    @Body() dto: CreateFriendStreakDto,
  ): Promise<ApiResponse<FriendStreakDto>> {
    return apiOk(
      'Friend streak proposed',
      await this.streaks.create(current.id, friendUserId, dto),
    );
  }

  @Post('streaks/:streakId/accept')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a friend streak' })
  @ApiOkResponseOf(FriendStreakDto)
  async acceptStreak(
    @CurrentUser() current: AuthUser,
    @Param('streakId', ParseIntPipe) id: number,
  ): Promise<ApiResponse<FriendStreakDto>> {
    return apiOk('Friend streak accepted', await this.streaks.accept(current.id, id));
  }

  @Post('streaks/:streakId/reject')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponseEmpty()
  async rejectStreak(
    @CurrentUser() current: AuthUser,
    @Param('streakId', ParseIntPipe) id: number,
  ): Promise<ApiResponse<null>> {
    await this.streaks.reject(current.id, id);
    return apiOk('Friend streak rejected', null);
  }

  @Patch('streaks/:streakId/categories')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponseOf(FriendStreakDto)
  async updateStreakCategories(
    @CurrentUser() current: AuthUser,
    @Param('streakId', ParseIntPipe) id: number,
    @Body() dto: FriendStreakCategoriesDto,
  ): Promise<ApiResponse<FriendStreakDto>> {
    return apiOk(
      'Friend streak categories updated',
      await this.streaks.updateCategories(current.id, id, dto),
    );
  }

  @Delete('streaks/:streakId')
  @ApiBearerAuth('access-token')
  @ApiOkResponseEmpty()
  async endStreak(
    @CurrentUser() current: AuthUser,
    @Param('streakId', ParseIntPipe) id: number,
  ): Promise<ApiResponse<null>> {
    await this.streaks.end(current.id, id);
    return apiOk('Friend streak ended', null);
  }

  @Get('streaks')
  @ApiBearerAuth('access-token')
  @ApiOkResponseOfArray(FriendStreakDto)
  async listStreaks(@CurrentUser() current: AuthUser): Promise<ApiResponse<FriendStreakDto[]>> {
    return apiOk('Friend streaks', await this.streaks.list(current.id));
  }

  @Get('streaks/:streakId')
  @ApiBearerAuth('access-token')
  @ApiOkResponseOf(FriendStreakDto)
  async getStreak(
    @CurrentUser() current: AuthUser,
    @Param('streakId', ParseIntPipe) id: number,
  ): Promise<ApiResponse<FriendStreakDto>> {
    return apiOk('Friend streak', await this.streaks.get(current.id, id));
  }

  /** Elimina una amistad aceptada. */
  @Delete(':friendUserId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove a friend' })
  @ApiOkResponseEmpty()
  async removeFriend(
    @CurrentUser() current: AuthUser,
    @Param('friendUserId', ParseIntPipe) friendUserId: number,
  ): Promise<ApiResponse<null>> {
    await this.friendships.removeFriend(current.id, friendUserId);
    return apiOk('Friend removed', null);
  }

  /** Lista bloqueos creados por el usuario. */
  @Get('blocks')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List blocked users' })
  @ApiOkResponseOfArray(BlockedUserDto)
  async listBlocks(@CurrentUser() current: AuthUser): Promise<ApiResponse<BlockedUserDto[]>> {
    return apiOk('Blocked users', await this.friendships.listBlocks(current.id));
  }

  /** Bloquea a un usuario y revoca la relación social. */
  @Post('blocks/:userId')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user' })
  @ApiOkResponseEmpty()
  async blockUser(
    @CurrentUser() current: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<null>> {
    await this.friendships.blockUser(current.id, userId);
    return apiOk('User blocked', null);
  }

  /** Retira un bloqueo propio. */
  @Delete('blocks/:userId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiOkResponseEmpty()
  async unblockUser(
    @CurrentUser() current: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<null>> {
    await this.friendships.unblockUser(current.id, userId);
    return apiOk('User unblocked', null);
  }
}
