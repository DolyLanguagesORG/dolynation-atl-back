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

@ApiTags('user')
@ApiBearerAuth('access-token')
@Controller('user')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get the authenticated user’s profile' })
  @ApiOkResponseOf(ProfileResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'User no longer exists', type: ApiErrorDto })
  async getProfile(@CurrentUser() current: AuthUser): Promise<ApiResponse<ProfileResponseDto>> {
    const profile = await this.users.getProfile(current.id);
    return apiOk('User profile', profile);
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Update the authenticated user’s profile',
    description:
      'Only mutable profile fields can be updated here. Email and password changes have dedicated flows.',
  })
  @ApiOkResponseOf(ProfileResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'User no longer exists', type: ApiErrorDto })
  async updateProfile(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<ProfileResponseDto>> {
    const profile = await this.users.updateProfile(current.id, dto);
    return apiOk('Profile updated', profile);
  }

  @Get('streak')
  @ApiOperation({ summary: 'Get the user’s recent streak history' })
  @ApiQuery({ name: 'days', type: StreakQueryDto, required: true })
  @ApiOkResponseOf(StreakResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  async getStreak(
    @CurrentUser() current: AuthUser,
    @Query() query: StreakQueryDto,
  ): Promise<ApiResponse<StreakResponseDto>> {
    const days = await this.users.activeStreakFor(current.id, query.days);
    return apiOk('Streak history', { days, count: days.length });
  }
}
