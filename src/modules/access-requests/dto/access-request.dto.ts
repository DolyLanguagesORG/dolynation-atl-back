import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from '../../subscriptions/subscriptions.constants';
import {
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_TYPES,
  type AccessRequestStatus,
  type AccessRequestType,
} from '../access-requests.constants';

/**
 * Payload sent by a verified user to request a subscription plan or language-change unlock.
 */
export class CreateAccessRequestDto {
  @ApiProperty({
    enum: ACCESS_REQUEST_TYPES,
    example: 'subscription',
    description: 'Type of access request (`subscription` or `language_unlock`)',
  })
  @IsIn(ACCESS_REQUEST_TYPES)
  type!: AccessRequestType;

  @ApiPropertyOptional({
    enum: SUBSCRIPTION_TIERS,
    example: 'dolly_plus',
    description: 'Target subscription tier when `type` is `subscription`',
  })
  @IsOptional()
  @IsIn(SUBSCRIPTION_TIERS)
  tier?: SubscriptionTier;

  @ApiPropertyOptional({
    example: 'I want to practice French and English every day during my exchange program.',
    maxLength: 1000,
    description: 'Optional motivation or context message sent to the administrator',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

/**
 * Access request record returned to the requesting user.
 */
export class AccessRequestItemDto {
  @ApiProperty({ example: 12, description: 'Unique access request identifier' })
  id!: number;

  @ApiProperty({ example: 42, description: 'Identifier of the requesting user' })
  userId!: number;

  @ApiProperty({
    enum: ACCESS_REQUEST_TYPES,
    example: 'subscription',
    description: 'Kind of request (`subscription` or `language_unlock`)',
  })
  requestType!: AccessRequestType;

  @ApiProperty({
    enum: SUBSCRIPTION_TIERS,
    nullable: true,
    example: 'dolly_plus',
    description: 'Requested subscription tier when `requestType` is `subscription`',
  })
  requestedTier!: string | null;

  @ApiProperty({
    enum: SUBSCRIPTION_TIERS,
    nullable: true,
    example: 'dolly',
    description: 'Snapshot of the user subscription tier when the request was submitted',
  })
  currentTier!: string | null;

  @ApiProperty({
    nullable: true,
    example: 'I am preparing for my B2 French exam.',
    description: 'Optional motivation message written by the user',
  })
  userMessage!: string | null;

  @ApiProperty({
    enum: ACCESS_REQUEST_STATUSES,
    example: 'pending',
    description: 'Current status of the request',
  })
  status!: AccessRequestStatus;

  @ApiProperty({
    nullable: true,
    example: 'Please confirm your learning goals before requesting Dolly Pro.',
    description: 'Rejection reason provided by the administrator when rejected',
  })
  rejectionReason!: string | null;

  @ApiProperty({
    nullable: true,
    example: '2026-11-16T18:00:00.000Z',
    format: 'date-time',
    description: 'Timestamp when the administrator reviewed the request',
  })
  reviewedAt!: Date | null;

  @ApiProperty({
    example: '2026-11-16T17:30:00.000Z',
    format: 'date-time',
    description: 'Timestamp when the request was created',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-11-16T17:30:00.000Z',
    format: 'date-time',
    description: 'Timestamp of the last update to this request',
  })
  updatedAt!: Date;
}

/**
 * Current access-request feature state and history for the authenticated user.
 */
export class MyAccessRequestsResponseDto {
  @ApiProperty({
    example: true,
    description: 'Indicates whether manual access requests are enabled (`ACCESS_REQUESTS_ENABLED`)',
  })
  enabled!: boolean;

  @ApiProperty({
    type: [AccessRequestItemDto],
    description: 'Access requests submitted by the user ordered from newest to oldest',
  })
  requests!: AccessRequestItemDto[];

  @ApiProperty({
    type: () => AccessRequestItemDto,
    nullable: true,
    description: 'Active pending subscription request if one exists',
  })
  pendingSubscriptionRequest!: AccessRequestItemDto | null;

  @ApiProperty({
    type: () => AccessRequestItemDto,
    nullable: true,
    description: 'Active pending language-unlock request if one exists',
  })
  pendingLanguageUnlockRequest!: AccessRequestItemDto | null;
}
