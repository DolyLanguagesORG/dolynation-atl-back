import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';

@ApiTags('user')
@ApiBearerAuth('access-token')
@Controller('user')
export class UsersController {
  constructor(private readonly users: UsersService) {}

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
