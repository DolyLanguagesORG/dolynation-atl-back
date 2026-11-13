import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { UsersService } from './users.service';
import { StreakQueryDto } from './dto/streak-query.dto';
import { StreakResponseDto } from './dto/streak-response.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';

/**
 * Controlador de perfil y racha de actividad del usuario autenticado (`/user`).
 */
@ApiTags('user')
@ApiBearerAuth('access-token')
@Controller('user')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Devuelve el perfil público del usuario autenticado.
   */
  @Get('profile')
  @ApiOperation({ summary: 'Obtener el perfil del usuario autenticado' })
  @ApiOkResponseOf(ProfileResponseDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({ description: 'El usuario ya no existe', type: ApiErrorDto })
  async getProfile(@CurrentUser() current: AuthUser): Promise<ApiResponse<ProfileResponseDto>> {
    const profile = await this.users.getProfile(current.id);
    return apiOk('User profile', profile);
  }

  /**
   * Actualiza los campos editables permitidos en el perfil del usuario.
   */
  @Patch('profile')
  @ApiOperation({
    summary: 'Actualizar el perfil del usuario autenticado',
    description:
      'Solo pueden modificarse aquí los campos editables del perfil. Los cambios de correo electrónico y contraseña tienen flujos dedicados.',
  })
  @ApiOkResponseOf(ProfileResponseDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({ description: 'El usuario ya no existe', type: ApiErrorDto })
  async updateProfile(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<ProfileResponseDto>> {
    const profile = await this.users.updateProfile(current.id, dto);
    return apiOk('Profile updated', profile);
  }

  /**
   * Devuelve el historial reciente de racha diaria para el número de días solicitado.
   */
  @Get('streak')
  @ApiOperation({ summary: 'Obtener el historial reciente de racha del usuario' })
  @ApiQuery({ name: 'days', type: StreakQueryDto, required: true })
  @ApiOkResponseOf(StreakResponseDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async getStreak(
    @CurrentUser() current: AuthUser,
    @Query() query: StreakQueryDto,
  ): Promise<ApiResponse<StreakResponseDto>> {
    const days = await this.users.activeStreakFor(current.id, query.days);
    return apiOk('Streak history', { days, count: days.length });
  }
}
