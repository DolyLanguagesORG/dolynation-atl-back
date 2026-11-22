import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AllowWithoutSubscription } from '../../common/decorators/allow-without-subscription.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiCreatedResponseOf, ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { CAPTCHA_ACTIONS, RateLimitByIp, RequireCaptcha } from '../security';
import { AccessRequestsService } from './access-requests.service';
import {
  AccessRequestItemDto,
  CreateAccessRequestDto,
  MyAccessRequestsResponseDto,
} from './dto/access-request.dto';

/**
 * Controlador de solicitudes de acceso a planes y desbloqueo de idiomas (`/access-requests`).
 */
@ApiTags('access-requests')
@ApiBearerAuth('access-token')
@AllowWithoutSubscription()
@Controller('access-requests')
export class AccessRequestsController {
  constructor(private readonly accessRequests: AccessRequestsService) {}

  /**
   * Devuelve si las solicitudes manuales están habilitadas y el historial del usuario autenticado.
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get access-request configuration status and current user requests',
  })
  @ApiOkResponseOf(MyAccessRequestsResponseDto)
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'Administrators cannot use student access-request endpoints',
    type: ApiErrorDto,
  })
  async getMyRequests(
    @CurrentUser() current: AuthUser,
  ): Promise<ApiResponse<MyAccessRequestsResponseDto>> {
    const result = await this.accessRequests.getMyRequests(current.id);
    return apiOk('User access requests', result);
  }

  /**
   * Crea una solicitud en lista de espera para un plan o para desbloquear cambio de idioma.
   */
  @RequireCaptcha(CAPTCHA_ACTIONS.ACCESS_REQUEST)
  @RateLimitByIp({ action: 'access_request', maxRequests: 15, windowMs: 15 * 60_000 })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a subscription plan or language-unlock access request',
  })
  @ApiCreatedResponseOf(AccessRequestItemDto)
  @ApiBadRequestResponse({
    description: 'Invalid request payload or action not applicable to current account',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description:
      'Access requests are disabled (ACCESS_REQUESTS_DISABLED) or account email is not verified (AUTH_EMAIL_NOT_VERIFIED)',
    type: ApiErrorDto,
  })
  @ApiConflictResponse({
    description:
      'A pending request of the same type already exists (ACCESS_REQUEST_ALREADY_PENDING)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  async createRequest(
    @CurrentUser() current: AuthUser,
    @Body() dto: CreateAccessRequestDto,
  ): Promise<ApiResponse<AccessRequestItemDto>> {
    const created = await this.accessRequests.createRequest(current.id, dto);
    return apiOk('Access request submitted successfully', created);
  }

  /**
   * Cancela una solicitud pendiente del usuario autenticado.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel one of your pending access requests',
  })
  @ApiOkResponseOf(AccessRequestItemDto)
  @ApiNotFoundResponse({
    description: 'Access request not found',
    type: ApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Request was already reviewed or cancelled (ACCESS_REQUEST_ALREADY_REVIEWED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  async cancelRequest(
    @CurrentUser() current: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<AccessRequestItemDto>> {
    const cancelled = await this.accessRequests.cancelRequest(current.id, id);
    return apiOk('Access request cancelled', cancelled);
  }
}
