import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf, ApiOkResponseOfArray } from '../../common/types/api-envelope.decorators';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { SelectSubscriptionDto } from './dto/select-subscription.dto';
import { SubscriptionPlanItemDto } from './dto/subscription-plan-response.dto';
import { UserSubscriptionResponseDto } from './dto/user-subscription-response.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get('subscriptions/plans')
  @ApiOperation({ summary: 'Get all available subscription plans and their tier limits' })
  @ApiOkResponseOfArray(SubscriptionPlanItemDto)
  getPlans(): ApiResponse<SubscriptionPlanItemDto[]> {
    const plans = this.subscriptions.getPlans();
    return apiOk('Subscription plans', plans);
  }

  @ApiBearerAuth('access-token')
  @Get('user/subscription')
  @ApiOperation({
    summary: 'Get the authenticated user’s current subscription plan and daily usage',
  })
  @ApiOkResponseOf(UserSubscriptionResponseDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'User not found', type: ApiErrorDto })
  async getCurrentSubscription(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<UserSubscriptionResponseDto>> {
    const result = await this.subscriptions.getUserSubscription(current.id);
    return apiOk('User subscription status', result);
  }

  @ApiBearerAuth('access-token')
  @Post('user/subscription')
  @ApiOperation({
    summary: 'Select or update the user’s subscription plan manually',
    description: 'Available plans: dolly (basic), dolly_plus (intermediate), dolly_pro (advanced).',
  })
  @ApiOkResponseOf(UserSubscriptionResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid subscription tier', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'Access forbidden', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'User not found', type: ApiErrorDto })
  async selectSubscription(
    @CurrentUser() current: AuthUser,
    @Body() dto: SelectSubscriptionDto,
  ): Promise<ApiResponse<UserSubscriptionResponseDto>> {
    const result = await this.subscriptions.selectSubscription(current.id, dto.tier);
    return apiOk('Subscription plan updated successfully', result);
  }
}
