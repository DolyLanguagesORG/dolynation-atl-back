import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/** Datos para invitar por correo a una cuenta student existente. */
export class CreateFriendRequestDto {
  @ApiProperty({ example: 'friend@example.com', description: 'Email of the student to invite' })
  @IsEmail()
  email!: string;
}

/** Datos para crear un enlace compartible de amistad. */
export class CreateInviteLinkDto {
  @ApiProperty({
    required: false,
    nullable: true,
    example: 5,
    description: 'Maximum redemptions; null means unlimited',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;
}

/** Entrada pública para aceptar o rechazar una invitación por token. */
export class InviteTokenParamDto {
  @ApiProperty({ example: 'invite-token' })
  @IsString()
  @Length(32, 256)
  token!: string;
}

/** Representación segura de un usuario amigo. */
export class FriendUserDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: 'Ana López' })
  fullName!: string;

  @ApiProperty({ example: '2026-11-24T12:00:00.000Z' })
  since!: Date;
}

/** Solicitud de amistad visible para quien la envió o recibió. */
export class FriendshipRequestDto extends FriendUserDto {
  @ApiProperty({ example: 10 })
  requestId!: number;

  @ApiProperty({ enum: ['incoming', 'outgoing'] })
  direction!: 'incoming' | 'outgoing';

  @ApiProperty({ enum: ['email', 'invite_link'] })
  origin!: 'email' | 'invite_link';

  @ApiProperty({ example: '2026-11-24T12:00:00.000Z' })
  createdAt!: Date;
}

/** Enlace de invitación, sin exponer su token en claro después de crearlo. */
export class InviteLinkDto {
  @ApiProperty({ example: 7 })
  id!: number;

  @ApiProperty({ nullable: true, example: 'https://app.dolynation.app/friends/invite?...' })
  url!: string | null;

  @ApiProperty({ nullable: true, example: 5 })
  maxUses!: number | null;

  @ApiProperty({ example: 0 })
  usesCount!: number;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({ nullable: true })
  revokedAt!: Date | null;
}

/** Enlace recién creado; el token claro solo aparece en esta respuesta. */
export class CreatedInviteLinkDto extends InviteLinkDto {
  @ApiProperty({ example: 'random-token-value' })
  token!: string;
}

/** Vista pública mínima de un enlace antes de iniciar sesión. */
export class InviteLinkPreviewDto {
  @ApiProperty({ example: 'Ana' })
  inviterName!: string;

  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiProperty({ nullable: true })
  expiresAt!: Date | null;

  @ApiProperty({ example: false })
  alreadyFriends!: boolean;
}

/** Datos para copiar categorías aprobadas de un amigo. */
export class CopyFriendCategoriesDto {
  @ApiProperty({ type: [String], example: ['travel', 'science'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  categories!: string[];
}

/** Filtros para las lecturas privadas publicadas por un amigo. */
export class FriendReadingsQueryDto {
  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Lectura de amigo con campos privados del propietario deliberadamente omitidos. */
export class FriendReadingDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty()
  difficulty!: string;

  @ApiProperty()
  language!: string;

  @ApiProperty()
  wordCount!: number;

  @ApiProperty()
  createdAt!: Date;
}

/** Resultado de iniciar una copia privada de una lectura de amigo. */
export class FriendReadingCopyDto {
  @ApiProperty()
  readingId!: number;

  @ApiProperty()
  sourceReadingId!: number;

  @ApiProperty()
  originType!: 'friend_copy';
}

/** Categoría aprobada visible para copiar a la biblioteca personal. */
export class FriendCategoryDto {
  @ApiProperty()
  category!: string;

  @ApiProperty()
  canonicalKey!: string;
}

/** Resultado detallado de la copia de categorías, incluyendo las que quedaron guardadas. */
export class CopyFriendCategoriesResultDto {
  @ApiProperty({ type: [String] })
  activated!: string[];

  @ApiProperty({ type: [String] })
  savedOnly!: string[];
}

/** Configuración inicial o actualización de categorías de una racha. */
export class FriendStreakCategoriesDto {
  @ApiProperty({ type: [String], minItems: 2, maxItems: 2 })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  categories!: string[];
}

/** Parámetros compartidos de una racha diaria. */
export class CreateFriendStreakDto extends FriendStreakCategoriesDto {
  @ApiProperty({ type: [String], minItems: 2, maxItems: 2 })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  friendCategories!: string[];

  @ApiProperty({ enum: ['es', 'en', 'fr', 'it'] })
  @IsString()
  language!: string;

  @ApiProperty({ enum: ['easy', 'medium', 'hard'], required: false })
  @IsOptional()
  @IsString()
  difficulty?: 'easy' | 'medium' | 'hard';

  @ApiProperty({ enum: ['short', 'medium', 'long'], required: false })
  @IsOptional()
  @IsString()
  size?: 'short' | 'medium' | 'long';
}

/** Vista privada de una racha; los datos del amigo se reducen a un booleano. */
export class FriendStreakDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['pending_partner', 'active', 'paused', 'ended'] }) status!: string;
  @ApiProperty({ type: [String] }) myCategories!: string[];
  @ApiProperty({ type: [String] }) partnerCategories!: string[];
  @ApiProperty() language!: string;
  @ApiProperty() difficulty!: string;
  @ApiProperty() size!: string;
  @ApiProperty() currentStreak!: number;
  @ApiProperty() longestStreak!: number;
  @ApiProperty({ nullable: true }) lastCompletedDate!: string | null;
  @ApiProperty() myCompletedToday!: boolean;
  @ApiProperty() partnerCompletedToday!: boolean;
  @ApiProperty() friendUserId!: number;
}

/** Vista de una amistad activa. */
export class FriendshipDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ type: FriendUserDto })
  friend!: FriendUserDto;

  @ApiProperty()
  createdAt!: Date;
}

/** Usuario bloqueado. */
export class BlockedUserDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  createdAt!: Date;
}
