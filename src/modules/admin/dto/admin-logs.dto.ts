import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AUDIT_ACTIONS, ERROR_SEVERITIES, type AuditAction, type ErrorSeverity } from '../../logs';
import { AdminPromptLogDto } from './admin-category.dto';

/**
 * Query parameters supported by `GET /admin/logs/audit`.
 */
export class AdminAuditLogsQueryDto {
  @ApiPropertyOptional({ example: 42, description: 'Filter by actor user id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actorUserId?: number;

  @ApiPropertyOptional({ example: 42, description: 'Filter by target/affected user id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetUserId?: number;

  @ApiPropertyOptional({ example: 'readings', description: 'Filter by module name' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  module?: string;

  @ApiPropertyOptional({
    enum: AUDIT_ACTIONS,
    example: 'UPDATE',
    description: 'Filter by standardized audit action',
  })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction;

  @ApiPropertyOptional({ example: 'reading.evaluated', description: 'Filter by event identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  event?: string;

  @ApiPropertyOptional({ example: 'readings', description: 'Filter by entity/table type' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ example: '123', description: 'Filter by entity identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityId?: string;

  @ApiPropertyOptional({ example: '203.0.113.10', description: 'Filter by client IP address' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @ApiPropertyOptional({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    description: 'Filter by request correlation id',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @ApiPropertyOptional({
    example: 'soft-deleted',
    description:
      'Case-insensitive text search across summary, actorEmail, event, entityId and path',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    example: '2026-11-01T00:00:00.000Z',
    description: 'Inclusive start date/timestamp (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-16T23:59:59.999Z',
    description: 'Inclusive end date/timestamp (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    maximum: 200,
    description: 'Page size (default 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, description: 'Pagination offset (default 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * Query parameters supported by `GET /admin/logs/errors`.
 */
export class AdminErrorLogsQueryDto {
  @ApiPropertyOptional({ example: 42, description: 'Filter by actor user id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actorUserId?: number;

  @ApiPropertyOptional({
    enum: ERROR_SEVERITIES,
    example: 'error',
    description: 'Filter by severity level (`warn`, `error`, `fatal`)',
  })
  @IsOptional()
  @IsIn(ERROR_SEVERITIES)
  severity?: ErrorSeverity;

  @ApiPropertyOptional({ example: 'ai_provider', description: 'Filter by error source' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @ApiPropertyOptional({ example: 'readings', description: 'Filter by module name' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  module?: string;

  @ApiPropertyOptional({
    example: 'AI_RATE_LIMITED',
    description: 'Filter by canonical error code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  errorCode?: string;

  @ApiPropertyOptional({ example: 500, description: 'Filter by HTTP status code' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  httpStatus?: number;

  @ApiPropertyOptional({ example: '203.0.113.10', description: 'Filter by client IP address' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @ApiPropertyOptional({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    description: 'Filter by request correlation id',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @ApiPropertyOptional({
    example: 'timeout',
    description: 'Case-insensitive text search across message, errorCode, httpPath and actorEmail',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    example: '2026-11-01T00:00:00.000Z',
    description: 'Inclusive start date/timestamp (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-16T23:59:59.999Z',
    description: 'Inclusive end date/timestamp (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    maximum: 200,
    description: 'Page size (default 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, description: 'Pagination offset (default 0)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * Audit log entry returned by `/admin/logs/audit` and `/admin/logs/trace/:requestId`.
 */
export class AdminAuditLogItemDto {
  @ApiProperty({ example: 101, description: 'Unique audit log entry identifier' })
  id!: number;

  @ApiProperty({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    nullable: true,
    description: 'HTTP request correlation identifier',
  })
  requestId!: string | null;

  @ApiProperty({ example: 42, nullable: true, description: 'Authenticated actor user id' })
  actorUserId!: number | null;

  @ApiProperty({
    example: 'student@example.com',
    nullable: true,
    description: 'Actor email address snapshot',
  })
  actorEmail!: string | null;

  @ApiProperty({ example: 'student', nullable: true, description: 'Actor role snapshot' })
  actorRole!: string | null;

  @ApiProperty({
    example: 42,
    nullable: true,
    description: 'Affected target user id when applicable',
  })
  targetUserId!: number | null;

  @ApiProperty({ example: '203.0.113.10', nullable: true, description: 'Client IP address' })
  ipAddress!: string | null;

  @ApiProperty({
    example: 'Mozilla/5.0 ...',
    nullable: true,
    description: 'Client User-Agent header',
  })
  userAgent!: string | null;

  @ApiProperty({ example: 'PATCH', nullable: true, description: 'HTTP method' })
  httpMethod!: string | null;

  @ApiProperty({
    example: '/api/v1/user/profile',
    nullable: true,
    description: 'HTTP request path',
  })
  httpPath!: string | null;

  @ApiProperty({ example: 200, nullable: true, description: 'Resulting HTTP status code' })
  httpStatus!: number | null;

  @ApiProperty({ example: 'users', description: 'Source domain module' })
  module!: string;

  @ApiProperty({ enum: AUDIT_ACTIONS, example: 'UPDATE', description: 'Standardized action type' })
  action!: AuditAction;

  @ApiProperty({ example: 'user.profile_updated', description: 'Domain event name' })
  event!: string;

  @ApiProperty({ example: 'users', nullable: true, description: 'Affected table or entity type' })
  entityType!: string | null;

  @ApiProperty({ example: '42', nullable: true, description: 'Affected entity primary identifier' })
  entityId!: string | null;

  @ApiProperty({
    example: 'Profile updated for user #42',
    description: 'Human-readable summary of the event',
  })
  summary!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Sanitized entity state snapshot before the operation',
  })
  beforeState!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Sanitized entity state snapshot after the operation',
  })
  afterState!: Record<string, unknown> | null;

  @ApiProperty({
    type: [String],
    example: ['fullName', 'updatedAt'],
    description: 'List of fields that changed between beforeState and afterState',
  })
  changedFields!: string[];

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Additional diagnostic metadata',
  })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ example: 24, nullable: true, description: 'Operation duration in milliseconds' })
  durationMs!: number | null;

  @ApiProperty({
    example: '2026-11-16T21:00:00.000Z',
    format: 'date-time',
    description: 'Creation timestamp',
  })
  createdAt!: Date;
}

/**
 * Paginated response payload for `GET /admin/logs/audit`.
 */
export class AdminAuditLogListResponseDto {
  @ApiProperty({ type: () => [AdminAuditLogItemDto], description: 'Matching audit log entries' })
  items!: AdminAuditLogItemDto[];

  @ApiProperty({ example: 120, description: 'Total matching rows before pagination' })
  total!: number;

  @ApiProperty({ example: 50, description: 'Applied page size' })
  limit!: number;

  @ApiProperty({ example: 0, description: 'Applied offset' })
  offset!: number;
}

/**
 * Error log entry returned by `/admin/logs/errors` and `/admin/logs/trace/:requestId`.
 */
export class AdminErrorLogItemDto {
  @ApiProperty({ example: 55, description: 'Unique error log entry identifier' })
  id!: number;

  @ApiProperty({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    nullable: true,
    description: 'HTTP request correlation identifier',
  })
  requestId!: string | null;

  @ApiProperty({ enum: ERROR_SEVERITIES, example: 'error', description: 'Severity level' })
  severity!: ErrorSeverity;

  @ApiProperty({ example: 'ai_provider', description: 'Origin subsystem of the failure' })
  source!: string;

  @ApiProperty({ example: 'readings', nullable: true, description: 'Source module name' })
  module!: string | null;

  @ApiProperty({ example: 'AI_RATE_LIMITED', description: 'Canonical error code' })
  errorCode!: string;

  @ApiProperty({ example: 429, nullable: true, description: 'HTTP status returned or upstream' })
  httpStatus!: number | null;

  @ApiProperty({
    example: 'Google request failed: 429 Too Many Requests',
    description: 'Full internal error message for diagnostics',
  })
  message!: string;

  @ApiProperty({ example: 'AppHttpException', nullable: true, description: 'Exception class name' })
  errorName!: string | null;

  @ApiProperty({
    example: 'Error: ...\n  at ...',
    nullable: true,
    description: 'Server-side stack trace when available',
  })
  errorStack!: string | null;

  @ApiProperty({ example: 42, nullable: true, description: 'Authenticated actor user id' })
  actorUserId!: number | null;

  @ApiProperty({
    example: 'student@example.com',
    nullable: true,
    description: 'Actor email address snapshot',
  })
  actorEmail!: string | null;

  @ApiProperty({ example: 'student', nullable: true, description: 'Actor role snapshot' })
  actorRole!: string | null;

  @ApiProperty({ example: '203.0.113.10', nullable: true, description: 'Client IP address' })
  ipAddress!: string | null;

  @ApiProperty({
    example: 'Mozilla/5.0 ...',
    nullable: true,
    description: 'Client User-Agent header',
  })
  userAgent!: string | null;

  @ApiProperty({ example: 'POST', nullable: true, description: 'HTTP method' })
  httpMethod!: string | null;

  @ApiProperty({ example: '/api/v1/readings', nullable: true, description: 'HTTP request path' })
  httpPath!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Sanitized HTTP request body',
  })
  requestBody!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Sanitized HTTP request query parameters',
  })
  requestQuery!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Structured error details and diagnostics',
  })
  details!: Record<string, unknown> | null;

  @ApiProperty({ example: 312, nullable: true, description: 'Elapsed duration in milliseconds' })
  durationMs!: number | null;

  @ApiProperty({
    example: '2026-11-16T21:00:00.000Z',
    format: 'date-time',
    description: 'Creation timestamp',
  })
  createdAt!: Date;
}

/**
 * Paginated response payload for `GET /admin/logs/errors`.
 */
export class AdminErrorLogListResponseDto {
  @ApiProperty({ type: () => [AdminErrorLogItemDto], description: 'Matching error log entries' })
  items!: AdminErrorLogItemDto[];

  @ApiProperty({ example: 18, description: 'Total matching rows before pagination' })
  total!: number;

  @ApiProperty({ example: 50, description: 'Applied page size' })
  limit!: number;

  @ApiProperty({ example: 0, description: 'Applied offset' })
  offset!: number;
}

/**
 * Combined chronological trace across audit_logs, error_logs and prompt_logs for a single requestId.
 */
export class AdminRequestTraceDto {
  @ApiProperty({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    description: 'Correlated request identifier',
  })
  requestId!: string;

  @ApiProperty({
    type: () => [AdminAuditLogItemDto],
    description: 'Audit logs recorded under this requestId in chronological order',
  })
  auditLogs!: AdminAuditLogItemDto[];

  @ApiProperty({
    type: () => [AdminErrorLogItemDto],
    description: 'Error logs recorded under this requestId in chronological order',
  })
  errorLogs!: AdminErrorLogItemDto[];

  @ApiProperty({
    type: () => [AdminPromptLogDto],
    description: 'Prompt logs recorded under this requestId in chronological order',
  })
  promptLogs!: AdminPromptLogDto[];
}
