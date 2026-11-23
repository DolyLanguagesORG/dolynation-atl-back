import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_TYPES,
  type AccessRequestStatus,
  type AccessRequestType,
} from '../../access-requests/access-requests.constants';
import { SUBSCRIPTION_TIERS } from '../../subscriptions/subscriptions.constants';
import { AdminUserRowDto } from './admin-category.dto';

/**
 * Filtros opcionales de estado, tipo y usuario para `GET /admin/requests`.
 */
export class AdminRequestsQueryDto {
  @ApiPropertyOptional({
    enum: ACCESS_REQUEST_STATUSES,
    example: 'pending',
    description: 'Optional status filter (`pending`, `approved`, `rejected`, `cancelled`)',
  })
  @IsOptional()
  @IsIn(ACCESS_REQUEST_STATUSES)
  status?: AccessRequestStatus;

  @ApiPropertyOptional({
    enum: ACCESS_REQUEST_TYPES,
    example: 'subscription',
    description: 'Optional type filter (`subscription`, `language_unlock`)',
  })
  @IsOptional()
  @IsIn(ACCESS_REQUEST_TYPES)
  type?: AccessRequestType;

  @ApiPropertyOptional({
    example: 'ana@example.com',
    description: 'Optional search string matched against user email or full name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

/**
 * Nota interna opcional al aprobar una solicitud de acceso.
 */
export class ApproveAccessRequestDto {
  @ApiPropertyOptional({
    example: 'Approved for early beta cohort.',
    maxLength: 500,
    description: 'Optional internal administrative note (not required)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Motivo obligatorio que se envía al usuario al rechazar una solicitud de acceso.
 */
export class RejectAccessRequestDto {
  @ApiProperty({
    example: 'Please verify your learning goals or start with the Dolly plan first.',
    minLength: 5,
    maxLength: 1000,
    description: 'Mandatory explanation sent to the user via email',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

/**
 * Solicitud de acceso enriquecida con datos de la cuenta que la presentó.
 */
export class AdminAccessRequestDto {
  @ApiProperty({ example: 15, description: 'Unique access request identifier' })
  id!: number;

  @ApiProperty({ example: 42, description: 'Identifier of the requesting user' })
  userId!: number;

  @ApiProperty({ example: 'student@example.com', description: 'Email address of the requester' })
  userEmail!: string;

  @ApiProperty({
    example: 'Jane Doe',
    nullable: true,
    description: 'Full name of the requester',
  })
  userFullName!: string | null;

  @ApiProperty({
    example: 'es',
    description: 'Preferred interface locale of the requester',
  })
  userLocale!: string;

  @ApiProperty({
    example: '2026-11-15T12:00:00.000Z',
    nullable: true,
    format: 'date-time',
    description: 'Timestamp when the requester verified their email, or null',
  })
  userEmailVerifiedAt!: Date | null;

  @ApiProperty({
    enum: SUBSCRIPTION_TIERS,
    nullable: true,
    example: 'dolly',
    description: 'Current active subscription tier of the user at query time',
  })
  userCurrentTier!: string | null;

  @ApiProperty({
    enum: ACCESS_REQUEST_TYPES,
    example: 'subscription',
    description: 'Request kind (`subscription` or `language_unlock`)',
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
    example: null,
    description: 'Subscription tier snapshot at the time the request was submitted',
  })
  currentTier!: string | null;

  @ApiProperty({
    nullable: true,
    example: 'I would like to practice French and Italian every morning.',
    description: 'Optional motivation message written by the requester',
  })
  userMessage!: string | null;

  @ApiProperty({
    enum: ACCESS_REQUEST_STATUSES,
    example: 'pending',
    description: 'Current lifecycle status of the request',
  })
  status!: AccessRequestStatus;

  @ApiProperty({
    nullable: true,
    example: 'Beta slots for Dolly Pro are full for this week.',
    description: 'Rejection reason provided by the administrator when rejected',
  })
  rejectionReason!: string | null;

  @ApiProperty({
    nullable: true,
    example: 1,
    description: 'Identifier of the administrator who reviewed the request',
  })
  reviewedByUserId!: number | null;

  @ApiProperty({
    nullable: true,
    example: '2026-11-16T18:10:00.000Z',
    format: 'date-time',
    description: 'Timestamp when the administrator reviewed the request',
  })
  reviewedAt!: Date | null;

  @ApiProperty({
    example: '2026-11-16T17:30:00.000Z',
    format: 'date-time',
    description: 'Timestamp when the request was submitted',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-11-16T18:10:00.000Z',
    format: 'date-time',
    description: 'Timestamp when the request was last updated',
  })
  updatedAt!: Date;
}

/**
 * Resultado de aprobar o rechazar una solicitud, incluido el estado del correo de notificación.
 */
export class ReviewAccessRequestResponseDto {
  @ApiProperty({
    type: () => AdminAccessRequestDto,
    description: 'Updated access request record',
  })
  request!: AdminAccessRequestDto;

  @ApiProperty({
    example: true,
    description: 'Whether the decision notification email was delivered successfully',
  })
  emailSent!: boolean;
}

/**
 * Vista administrativa de un usuario y el historial de sus solicitudes de acceso.
 */
export class AdminUserDetailDto {
  @ApiProperty({
    type: () => AdminUserRowDto,
    description: 'Account summary for the selected user',
  })
  user!: AdminUserRowDto;

  @ApiProperty({
    type: () => [AdminAccessRequestDto],
    description: 'Access requests submitted by this user ordered newest/pending first',
  })
  requests!: AdminAccessRequestDto[];
}
