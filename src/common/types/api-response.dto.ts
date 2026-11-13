import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';

/**
 * Sobre común utilizado por todas las respuestas exitosas (HTTP 2xx).
 *
 * El tipo del campo `data` es intencionalmente abierto (`object`). La documentación
 * de cada endpoint reemplaza el esquema inline de `data` con un `$ref` hacia el
 * modelo real (ver `api-envelope.decorators.ts`). Usar un genérico `TData` aquí
 * dispara la detección de dependencias circulares de NestJS Swagger porque el
 * generador de esquemas no resuelve el tipo concreto.
 */
export class ApiSuccessEnvelopeDto {
  @ApiProperty({
    example: 'Reading generated successfully',
    description: 'Mensaje de estado legible para humanos',
  })
  message!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Estructura del recurso (o lista de recursos) devuelto.',
  })
  data!: object;

  @ApiProperty({
    nullable: true,
    description:
      'Siempre es null en respuestas exitosas. Cuando ocurre un error, sigue la forma de ApiErrorDto.',
  })
  error!: ApiErrorDto | null;
}

/**
 * Representación documental cuando un endpoint 204 No Content no devuelve cuerpo,
 * manteniendo la consistencia visual en Scalar.
 */
export class ApiNoContentResponseDto {
  @ApiProperty({
    example: { ok: true },
    description:
      'Marcador de respuesta vacía para mantener uniforme el esquema en la documentación.',
  })
  noContent!: Record<string, never>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Autenticación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vista pública del usuario incluida en `/auth/me`, `/auth/register` y `/auth/login`.
 * Nunca expone el hash de la contraseña.
 */
export class AuthUserViewDto {
  @ApiProperty({ example: 42, description: 'Identificador único del usuario' })
  id!: number;

  @ApiProperty({ example: 'sebastian@example.com', description: 'Correo electrónico de la cuenta' })
  email!: string;

  @ApiProperty({
    example: 'Sebastián Rodríguez',
    nullable: true,
    description: 'Nombre completo del usuario o nulo si aún no está configurado',
  })
  fullName!: string | null;

  @ApiProperty({
    example: 'dolly',
    nullable: true,
    enum: ['dolly', 'dolly_plus', 'dolly_pro'],
    description: 'Nivel de suscripción actual (`dolly`, `dolly_plus`, `dolly_pro` o nulo)',
  })
  subscriptionTier!: string | null;

  @ApiProperty({ example: 5, description: 'Racha activa actual en días consecutivos.' })
  currentStreak!: number;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Última fecha en la que se extendió la racha.',
  })
  lastStreakDate!: string | null;

  @ApiProperty({
    example: '2026-08-31T15:16:43.474Z',
    format: 'date-time',
    description: 'Fecha y hora de creación de la cuenta',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-08-31T15:20:11.902Z',
    format: 'date-time',
    nullable: true,
    description:
      'Momento en que el usuario confirmó su correo. Es nulo mientras la cuenta siga sin verificar',
  })
  emailVerifiedAt!: Date | null;

  @ApiProperty({
    example: 'es',
    enum: ['es', 'en'],
    description:
      'Locale de interfaz del usuario. Determina el idioma de los correos transaccionales',
  })
  locale!: string;
}

/**
 * Par de tokens JWT devuelto por `/auth/register`, `/auth/login` y `/auth/refresh`.
 */
export class AuthTokensDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    description: 'Token JWT de acceso para autenticar peticiones',
  })
  accessToken!: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    description: 'Token JWT de actualización para renovar la sesión',
  })
  refreshToken!: string;

  @ApiProperty({
    example: 300,
    description: 'Tiempo de vida del token de acceso en segundos.',
  })
  expiresIn!: number;
}

/**
 * Estructura de `data` para `/auth/register` y `/auth/login` (201 / 200).
 */
export class AuthResponseDto {
  @ApiProperty({
    type: () => AuthUserViewDto,
    description: 'Perfil público del usuario autenticado',
  })
  user!: AuthUserViewDto;

  @ApiProperty({ type: () => AuthTokensDto, description: 'Par de tokens emitidos para la sesión' })
  tokens!: AuthTokensDto;
}

/**
 * Estructura de `data` para `/auth/register` (201).
 *
 * `tokens` es `null` cuando la verificación de correo es obligatoria: en ese
 * caso la cuenta queda pendiente de confirmar y no se emite ninguna sesión.
 */
export class RegisterResponseDto {
  @ApiProperty({
    type: () => AuthUserViewDto,
    description: 'Perfil público del usuario recién creado',
  })
  user!: AuthUserViewDto;

  @ApiProperty({
    type: () => AuthTokensDto,
    nullable: true,
    description:
      'Par de tokens emitidos para la sesión. Es nulo cuando el usuario debe confirmar su correo antes de poder entrar',
  })
  tokens!: AuthTokensDto | null;

  @ApiProperty({
    example: false,
    description: 'Indica que el usuario debe confirmar su correo antes de poder iniciar sesión',
  })
  emailVerificationRequired!: boolean;
}

/**
 * Estructura de `data` para `/auth/verify-email` (200).
 */
export class EmailVerifiedDto {
  @ApiProperty({ example: true, description: 'Siempre `true`: el correo quedó confirmado' })
  emailVerified!: boolean;

  @ApiProperty({
    type: AuthUserViewDto,
    description: 'Perfil público actualizado del usuario autenticado',
  })
  user!: AuthUserViewDto;

  @ApiProperty({
    type: AuthTokensDto,
    description: 'Par de tokens JWT emitidos tras confirmar el correo para continuar el onboarding',
  })
  tokens!: AuthTokensDto;
}

/**
 * Estructura de `data` para `/auth/forgot-password` y `/auth/resend-verification` (200).
 *
 * El valor es siempre `true`, exista o no la cuenta, para no permitir
 * enumerar qué correos están registrados.
 */
export class EmailSentDto {
  @ApiProperty({
    example: true,
    description: 'Siempre `true`. Si la cuenta existe, se envió el correo correspondiente',
  })
  emailSent!: boolean;
}

/**
 * Estructura de `data` para `/auth/reset-password` (200).
 */
export class PasswordUpdatedDto {
  @ApiProperty({ example: true, description: 'Siempre `true`: la contraseña quedó actualizada' })
  passwordUpdated!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subtema de categoría devuelto dentro de cada categoría en `/readings/options`.
 */
export class ReadingSubcategoryDto {
  @ApiProperty({
    example: 'web_development',
    description: 'Identificador interno de la subcategoría',
  })
  id!: string;

  @ApiProperty({ example: 'Web Development', description: 'Nombre legible de la subcategoría' })
  name!: string;
}

/**
 * Entrada de categoría devuelta por `/readings/options`.
 */
export class ReadingCategoryDto {
  @ApiProperty({
    example: 'programming',
    enum: ['technology', 'history', 'education', 'programming', 'culture', 'pop_culture'],
    description: 'Identificador interno de la categoría',
  })
  id!: string;

  @ApiProperty({ example: 'Programming', description: 'Nombre legible de la categoría' })
  name!: string;

  @ApiProperty({
    example: [
      { id: 'web_development', name: 'Web Development' },
      { id: 'databases', name: 'Databases' },
    ],
    description: 'Subtemas en los que el LLM puede enfocarse dentro de esta categoría.',
    type: [ReadingSubcategoryDto],
  })
  subcategories!: ReadingSubcategoryDto[];
}

/**
 * Configuración predefinida de tamaño de lectura devuelta por `/readings/options`.
 */
export class ReadingSizeDto {
  @ApiProperty({
    example: 'short',
    enum: ['short', 'medium', 'long'],
    description: 'Identificador del tamaño',
  })
  id!: string;

  @ApiProperty({ example: 'Short', description: 'Etiqueta legible del tamaño' })
  label!: string;

  @ApiProperty({ example: '80-120 words', description: 'Rango aproximado de palabras' })
  wordRange!: string;

  @ApiProperty({ example: '~1 min', description: 'Tiempo estimado de lectura' })
  readingTime!: string;
}

/**
 * Estructura de `data` para `/readings/options` (200). Devuelve el catálogo necesario
 * para poblar los selectores de la interfaz: categorías con subtemas, los tres niveles
 * de dificultad, los tres tamaños predefinidos y los niveles CEFR informativos.
 */
export class ReadingOptionsDto {
  @ApiProperty({
    description: 'Todas las categorías disponibles junto con sus subtemas',
    type: [ReadingCategoryDto],
  })
  categories!: ReadingCategoryDto[];

  @ApiProperty({
    example: ['easy', 'medium', 'hard'],
    type: [String],
    description: 'Niveles de dificultad disponibles',
  })
  difficulties!: string[];

  @ApiProperty({
    description: 'Tamaños predefinidos de lectura — controlan la extensión y tiempo estimado',
    type: [ReadingSizeDto],
  })
  sizes!: ReadingSizeDto[];

  @ApiProperty({
    example: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    type: [String],
    description: 'Niveles del Marco Común Europeo de Referencia (CEFR) de referencia',
  })
  cefrLevels!: string[];
}

/**
 * Entidad de lectura devuelta por los endpoints de `/readings`.
 * Refleja una fila de la tabla `readings` en Drizzle, documentada explícitamente
 * para que Scalar muestre cada campo.
 */
export class ReadingDto {
  @ApiProperty({ example: 42, description: 'Identificador único de la lectura' })
  id!: number;

  @ApiProperty({ example: 7, description: 'Identificador del usuario propietario' })
  userId!: number;

  @ApiProperty({ example: 'The Rise of TypeScript', description: 'Título de la lectura' })
  title!: string;

  @ApiProperty({
    example: 'How a small Microsoft project became the default for web backends.',
    description: 'Resumen breve introductorio de la lectura',
  })
  description!: string;

  @ApiProperty({
    description: 'Cuerpo completo de la lectura en texto plano.',
    example: 'TypeScript was first released in 2012...',
  })
  content!: string;

  @ApiProperty({
    example: 'technology',
    nullable: true,
    description: 'Categoría temática de la lectura',
  })
  category!: string | null;

  @ApiProperty({
    example: 'medium',
    nullable: true,
    description: 'Nivel de dificultad aplicado al generar la lectura',
  })
  difficulty!: string | null;

  @ApiProperty({
    example: 'en',
    enum: ['es', 'en', 'fr', 'it'],
    description: 'Idioma objetivo en el que fue generada la lectura (`es`, `en`, `fr` o `it`)',
  })
  language!: string;

  @ApiProperty({
    example: 280,
    description: 'Conteo total de palabras de la lectura generada',
    nullable: true,
  })
  wordCount!: number | null;

  @ApiProperty({
    example: 'pending',
    enum: ['pending', 'completed'],
    description: 'Estado actual de la lectura (`pending` o `completed`)',
  })
  status!: string;

  @ApiProperty({
    example: 87,
    nullable: true,
    description:
      'Calificación obtenida tras evaluar la comprensión (0–100); null si sigue pendiente.',
  })
  score!: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Retroalimentación generada por IA tras la evaluación; null si sigue pendiente.',
  })
  feedback!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description:
      'Resumen escrito por el usuario al enviar la evaluación. Es null hasta que se evalúa.',
  })
  userResponse!: string | null;

  @ApiProperty({
    example: false,
    nullable: true,
    description: 'Indica si el usuario aprobó (score >= 80). Es null hasta la evaluación.',
  })
  passed!: boolean | null;

  @ApiProperty({
    example: '2026-08-31T15:16:43.474Z',
    format: 'date-time',
    description: 'Fecha y hora de creación de la lectura',
  })
  createdAt!: Date;

  @ApiProperty({
    example: null,
    nullable: true,
    format: 'date-time',
    description: 'Fecha y hora de la última actualización',
  })
  updatedAt!: Date | null;

  @ApiProperty({
    example: null,
    nullable: true,
    format: 'date-time',
    description: 'Marca temporal de borrado lógico (soft-delete).',
  })
  deletedAt!: Date | null;
}

/**
 * Estructura de `data` para `/readings/{id}/evaluate` (200).
 */
export class EvaluationResultDto {
  @ApiProperty({
    example: 87,
    minimum: 0,
    maximum: 100,
    description: 'Puntuación de comprensión lectora de 0 a 100',
  })
  score!: number;

  @ApiProperty({ example: true, description: 'Es true cuando la puntuación es >= 80' })
  passed!: boolean;

  @ApiProperty({
    example: 'Your summary captured the main point about TypeScript adoption.',
    description: 'Retroalimentación generada por la IA para el usuario',
  })
  feedback!: string;

  @ApiProperty({
    example: 'TypeScript adoption grew because of better tooling and gradual typing.',
    description: 'Copia del resumen enviado por el usuario para comodidad del cliente.',
  })
  userResponse!: string;

  @ApiProperty({
    type: () => ReadingDto,
    description: 'Registro actualizado de la lectura evaluada',
  })
  reading!: ReadingDto;
}

/**
 * Estructura de `data` para `/readings/{id}/explanations` (200).
 */
export class ExplanationResultDto {
  @ApiProperty({
    example: 'In this context, "release" means publishing a new version of software.',
    description: 'Explicación contextual de la palabra o expresión consultada',
  })
  explanation!: string;

  @ApiProperty({ type: () => ReadingDto, description: 'Lectura asociada a la consulta' })
  reading!: ReadingDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// IA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estructura de `data` para `/ia/chat` (200).
 */
export class ChatResponseDto {
  @ApiProperty({
    example: 'TypeScript was first released in 2012 by Microsoft...',
    description: 'Respuesta en texto plano generada por el proveedor de IA',
  })
  text!: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Salud del servicio (Health)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estructura de `data` para `/health/live` y `/health/ready` (200).
 * Refleja el formato `HealthCheckResult` de `@nestjs/terminus`.
 */
export class HealthCheckResultDto {
  @ApiProperty({
    description:
      'Mapa de estado por dependencia. Las claves identifican cada dependencia (p. ej. "app", "db").',
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
    description: 'Cuando una dependencia falla, indica la clave afectada y el motivo.',
    type: 'object',
    nullable: true,
    example: null,
    additionalProperties: { type: 'string' },
  })
  error!: Record<string, Record<string, unknown>> | null;

  @ApiProperty({
    example: 'up',
    enum: ['up', 'down'],
    description: 'Estado global de salud de la aplicación',
  })
  status!: 'up' | 'down';
}

// Reexporta ApiPropertyOptions para que el archivo sea autocontenido para consumidores externos.
export type { ApiPropertyOptions };

// ─────────────────────────────────────────────────────────────────────────────
// Sobre estándar de error (reutilizado desde common/errors/api-error.dto.ts)
// El tipo en tiempo de ejecución debe importarse para que los consumidores del spec
// puedan referenciarlo desde una ruta única.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiErrorDto } from '../errors/api-error.dto';
export { ApiErrorDto };
