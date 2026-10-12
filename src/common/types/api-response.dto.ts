import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';

/** Common envelope used by every successful (HTTP 2xx) response.
 *
 * The `data` field type is intentionally loose (`object`). Per-endpoint
 * documentation overrides the inline `data` schema with a `$ref` to the
 * actual model (see `api-envelope.decorators.ts`). Using a generic
 * `TData` here triggers NestJS's circular-dependency detection because
 * the schema generator cannot resolve the concrete type, so we declare
 * it as `object` directly. */
export class ApiSuccessEnvelopeDto {
  @ApiProperty({
    example: 'Reading generated successfully',
    description: 'Human-readable status message',
  })
  message!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'The shape of the resource (or list of resources) returned.',
  })
  data!: object;

  @ApiProperty({
    nullable: true,
    description:
      'Always null on success. When populated, see ApiErrorDto for the shape (error envelope is reused from /common/errors).',
  })
  error!: ApiErrorDto | null;
}

/**
 * 204 No Content has no body. This class is what Scalar renders when a
 * controller returns `void` — keeps the response shape consistent.
 */
export class ApiNoContentResponseDto {
  @ApiProperty({
    example: { ok: true },
    description: 'Always present (even on 204) so the envelope stays uniform.',
  })
  noContent!: Record<string, never>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `user` slice of /auth/me or /auth/register's response body. Never
 * includes the password hash.
 */
export class AuthUserViewDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: 'sebastian@example.com' })
  email!: string;

  @ApiProperty({ example: 'Sebastián Rodríguez' })
  fullName!: string;

  @ApiProperty({ example: 5, description: 'Current active streak in days.' })
  currentStreak!: number;

  @ApiProperty({ example: null, nullable: true, description: 'Last day the streak was extended.' })
  lastStreakDate!: string | null;

  @ApiProperty({ example: '2026-08-31T15:16:43.474Z', format: 'date-time' })
  createdAt!: Date;
}

/**
 * JWT pair returned by /auth/register, /auth/login, /auth/refresh.
 */
export class AuthTokensDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds.' })
  expiresIn!: number;
}

/**
 * `data` shape for /auth/register and /auth/login (201 / 200).
 */
export class AuthResponseDto {
  @ApiProperty({ type: () => AuthUserViewDto })
  user!: AuthUserViewDto;

  @ApiProperty({ type: () => AuthTokensDto })
  tokens!: AuthTokensDto;
}

/**
 * `data` shape for /auth/refresh (200).
 */
export class RefreshResponseDto {
  @ApiProperty({ type: () => AuthTokensDto })
  tokens!: AuthTokensDto;
}

/**
 * `data` shape for /auth/me (200).
 */
export class MeResponseDto {
  @ApiProperty({ type: () => AuthUserViewDto })
  user!: AuthUserViewDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Readings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One category entry returned by /readings/options.
 */
export class ReadingCategoryDto {
  @ApiProperty({
    example: 'programming',
    enum: ['technology', 'history', 'education', 'programming', 'culture', 'pop_culture'],
    description: 'Internal identifier for the category',
  })
  id!: 'technology' | 'history' | 'education' | 'programming' | 'culture' | 'pop_culture';

  @ApiProperty({ example: 'Programming', description: 'Human-readable name of the category' })
  name!: string;

  @ApiProperty({
    example: ['Web Development', 'Databases'],
    description: 'Sub-topics the LLM can focus on inside this category.',
    type: [String],
  })
  subcategories!: string[];
}

/**
 * One reading size preset returned by /readings/options.
 */
export class ReadingSizeDto {
  @ApiProperty({ example: 'short', enum: ['short', 'medium', 'long'] })
  id!: 'short' | 'medium' | 'long';

  @ApiProperty({ example: 'Short' })
  label!: string;

  @ApiProperty({ example: '80-120 words' })
  wordRange!: string;

  @ApiProperty({ example: '~1 min' })
  readingTime!: string;
}

/**
 * `data` shape for /readings/options (200). Returns the catalogue the
 * UI needs to populate its pickers — categories with sub-topics, the
 * three difficulty levels, the three size presets, and informational
 * CEFR mappings.
 */
export class ReadingOptionsDto {
  @ApiProperty({
    description: 'All available categories with their sub-topics',
    type: [ReadingCategoryDto],
  })
  categories!: ReadingCategoryDto[];

  @ApiProperty({ example: ['easy', 'medium', 'hard'], type: [String] })
  difficulties!: string[];

  @ApiProperty({
    description: 'Reading size presets — controls word count and reading time',
    type: [ReadingSizeDto],
  })
  sizes!: ReadingSizeDto[];

  @ApiProperty({ example: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], type: [String] })
  cefrLevels!: string[];
}

/**
 * A reading entity as returned by /readings endpoints.
 * Mirrors the Drizzle `readings` table row but documented explicitly so
 * Scalar renders every field.
 */
export class ReadingDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: 7, description: 'Owning user id' })
  userId!: number;

  @ApiProperty({ example: 'The Rise of TypeScript' })
  title!: string;

  @ApiProperty({ example: 'How a small Microsoft project became the default for web backends.' })
  description!: string;

  @ApiProperty({
    description: 'Full reading body in plain text.',
    example: 'TypeScript was first released in 2012...',
  })
  content!: string;

  @ApiProperty({ example: 'technology', nullable: true })
  category!: string | null;

  @ApiProperty({ example: 'medium', nullable: true })
  difficulty!: string | null;

  @ApiProperty({ example: 280, description: 'Word count of the generated reading', nullable: true })
  wordCount!: number | null;

  @ApiProperty({ example: 'pending', enum: ['pending', 'completed'] })
  status!: string;

  @ApiProperty({ example: 87, nullable: true, description: 'Set after evaluation; 0–100.' })
  score!: number | null;

  @ApiProperty({ example: null, nullable: true, description: 'Set after evaluation.' })
  feedback!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description:
      "User's written summary (set when the user evaluates the reading). Null until evaluation.",
  })
  userResponse!: string | null;

  @ApiProperty({
    example: false,
    nullable: true,
    description: 'true if score >= 80. null until evaluation.',
  })
  passed!: boolean | null;

  @ApiProperty({ example: '2026-08-31T15:16:43.474Z', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ example: null, nullable: true, format: 'date-time' })
  updatedAt!: Date | null;

  @ApiProperty({
    example: null,
    nullable: true,
    format: 'date-time',
    description: 'Soft-delete timestamp.',
  })
  deletedAt!: Date | null;
}

/**
 * `data` shape for /readings/{id}/evaluate (200).
 */
export class EvaluationResultDto {
  @ApiProperty({ example: 87, minimum: 0, maximum: 100 })
  score!: number;

  @ApiProperty({ example: true, description: 'true if score >= 80' })
  passed!: boolean;

  @ApiProperty({
    example: 'Your summary captured the main point about TypeScript adoption.',
    description: 'AI-generated feedback for the user',
  })
  feedback!: string;

  @ApiProperty({
    example: 'TypeScript adoption grew because of better tooling and gradual typing.',
    description: 'Echo of the user response that was evaluated (for app convenience).',
  })
  userResponse!: string;

  @ApiProperty({ type: () => ReadingDto })
  reading!: ReadingDto;
}

/**
 * `data` shape for /readings/{id}/explanations (200).
 */
export class ExplanationResultDto {
  @ApiProperty({
    example: 'In this context, "release" means publishing a new version of software.',
  })
  explanation!: string;

  @ApiProperty({ type: () => ReadingDto })
  reading!: ReadingDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// IA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `data` shape for /ia/chat (200).
 */
export class ChatResponseDto {
  @ApiProperty({ example: 'TypeScript was first released in 2012 by Microsoft...' })
  text!: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `data` shape for /health/live and /health/ready (200).
 * Mirrors the `@nestjs/terminus` HealthCheckResult shape.
 */
export class HealthCheckResultDto {
  @ApiProperty({
    description: 'Per-dependency status map. Keys are dependency identifiers (e.g. "app", "db").',
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['up', 'down'] },
      },
    },
    example: {
      app: { status: 'up', uptime: 12345 },
      db: { status: 'up' },
    },
  })
  info!: Record<string, Record<string, unknown> & { status: 'up' | 'down' }>;

  @ApiProperty({
    description: 'When a dependency is down, the failing key → reason.',
    type: 'object',
    nullable: true,
    example: null,
    additionalProperties: { type: 'string' },
  })
  error!: Record<string, Record<string, unknown>> | null;

  @ApiProperty({ example: 'up', enum: ['up', 'down'] })
  status!: 'up' | 'down';
}

// Re-export types with the ApiPropertyOptions type so the file is self-contained
// for callers that import these DTOs from elsewhere.
export type { ApiPropertyOptions };

// ─────────────────────────────────────────────────────────────────────────────
// Standard error envelope (re-used from common/errors/api-error.dto.ts)
// The runtime type must be importable, so we re-export it here for the
// /readings/openapi.json consumers that fetch a single import path.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiErrorDto } from '../errors/api-error.dto';
export { ApiErrorDto };
