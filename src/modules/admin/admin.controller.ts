import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
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
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOf, ApiOkResponseOfArray } from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import {
  AdminCategoryDto,
  AdminPromptLogDto,
  AdminUserRowDto,
  AdminUsersQueryDto,
} from './dto/admin-category.dto';
import {
  AdminAccessRequestDto,
  AdminRequestsQueryDto,
  AdminUserDetailDto,
  ApproveAccessRequestDto,
  RejectAccessRequestDto,
  ReviewAccessRequestResponseDto,
} from './dto/admin-requests.dto';
import {
  AdminAuditLogItemDto,
  AdminAuditLogListResponseDto,
  AdminAuditLogsQueryDto,
  AdminErrorLogItemDto,
  AdminErrorLogListResponseDto,
  AdminErrorLogsQueryDto,
  AdminRequestTraceDto,
} from './dto/admin-logs.dto';

/**
 * Controlador para rutas de administración (`/admin`), protegido por `AdminGuard`.
 */
@ApiTags('admin')
@ApiBearerAuth('access-token')
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * Devuelve el catálogo global de categorías y subcategorías.
   */
  @Get('categories')
  @ApiOperation({
    summary: 'List global categories (admin only)',
    description:
      'Returns the global categories catalog with subcategories. Mutating the catalog requires a backing table.',
  })
  @ApiOkResponseOfArray(AdminCategoryDto)
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'User is not an administrator',
    type: ApiErrorDto,
  })
  listCategories(): ApiResponse<AdminCategoryDto[]> {
    return apiOk('Admin categories', this.admin.listCategories());
  }

  /**
   * Devuelve los fallos recientes del proveedor de IA (`prompt_logs`).
   */
  @Get('prompt-logs')
  @ApiOperation({
    summary: 'List recent AI provider failures (admin only)',
    description: 'Returns `prompt_logs` rows containing original AI provider error details.',
  })
  @ApiOkResponseOfArray(AdminPromptLogDto)
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'User is not an administrator',
    type: ApiErrorDto,
  })
  async listPromptLogs(): Promise<ApiResponse<AdminPromptLogDto[]>> {
    return apiOk('Admin prompt logs', await this.admin.listPromptLogs());
  }

  /**
   * Lista filtrable y paginada de bitácoras de auditoría (`audit_logs`).
   */
  @Get('logs/audit')
  @ApiOperation({
    summary: 'List audit logs with detective filters (admin only)',
    description:
      'Returns paginated audit_logs entries with actor, IP, module, action, before/after diff and request correlation.',
  })
  @ApiOkResponseOf(AdminAuditLogListResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid filter query parameter', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'User is not an administrator', type: ApiErrorDto })
  async listAuditLogs(
    @Query() query: AdminAuditLogsQueryDto = {},
  ): Promise<ApiResponse<AdminAuditLogListResponseDto>> {
    const result = await this.admin.listAuditLogs(query);
    return apiOk('Admin audit logs', result);
  }

  /**
   * Obtiene el detalle completo (beforeState, afterState, metadata) de un registro de auditoría.
   */
  @Get('logs/audit/:id')
  @ApiOperation({ summary: 'Get a single audit log entry by id (admin only)' })
  @ApiOkResponseOf(AdminAuditLogItemDto)
  @ApiNotFoundResponse({ description: 'Audit log entry not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'User is not an administrator', type: ApiErrorDto })
  async getAuditLogDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<AdminAuditLogItemDto>> {
    const item = await this.admin.getAuditLogById(id);
    return apiOk('Admin audit log detail', item);
  }

  /**
   * Lista filtrable y paginada de errores del sistema (`error_logs`).
   */
  @Get('logs/errors')
  @ApiOperation({
    summary: 'List system, HTTP, SMTP, moderation and AI error logs (admin only)',
    description: 'Returns paginated error_logs entries for diagnostics and troubleshooting.',
  })
  @ApiOkResponseOf(AdminErrorLogListResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid filter query parameter', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'User is not an administrator', type: ApiErrorDto })
  async listErrorLogs(
    @Query() query: AdminErrorLogsQueryDto = {},
  ): Promise<ApiResponse<AdminErrorLogListResponseDto>> {
    const result = await this.admin.listErrorLogs(query);
    return apiOk('Admin error logs', result);
  }

  /**
   * Obtiene el detalle completo de un error registrado incluyendo stack trace y payloads sanitizados.
   */
  @Get('logs/errors/:id')
  @ApiOperation({ summary: 'Get a single error log entry by id (admin only)' })
  @ApiOkResponseOf(AdminErrorLogItemDto)
  @ApiNotFoundResponse({ description: 'Error log entry not found', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'User is not an administrator', type: ApiErrorDto })
  async getErrorLogDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<AdminErrorLogItemDto>> {
    const item = await this.admin.getErrorLogById(id);
    return apiOk('Admin error log detail', item);
  }

  /**
   * Reconstruye la traza completa de una petición HTTP por su `requestId` en todas las tablas de logs.
   */
  @Get('logs/trace/:requestId')
  @ApiOperation({
    summary: 'Trace all audit, error and prompt logs correlated by requestId (admin only)',
  })
  @ApiOkResponseOf(AdminRequestTraceDto)
  @ApiBadRequestResponse({ description: 'Invalid requestId', type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'User is not an administrator', type: ApiErrorDto })
  async getRequestTrace(
    @Param('requestId') requestId: string,
  ): Promise<ApiResponse<AdminRequestTraceDto>> {
    const trace = await this.admin.getRequestTrace(requestId);
    return apiOk('Admin request trace', trace);
  }

  /**
   * Devuelve el listado reciente de usuarios para supervisión administrativa.
   */
  @Get('users')
  @ApiOperation({ summary: 'List users for administration and supervision (admin only)' })
  @ApiOkResponseOfArray(AdminUserRowDto)
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'User is not an administrator',
    type: ApiErrorDto,
  })
  async listUsers(
    @Query() query: AdminUsersQueryDto = {},
  ): Promise<ApiResponse<AdminUserRowDto[]>> {
    const list = await this.admin.listUsers(query);
    return apiOk('Admin users', list);
  }

  /**
   * Devuelve el detalle de un usuario específico junto con sus solicitudes de acceso.
   */
  @Get('users/:id')
  @ApiOperation({
    summary: 'Get a single user summary and access requests (admin only)',
  })
  @ApiOkResponseOf(AdminUserDetailDto)
  @ApiNotFoundResponse({
    description: 'User not found',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'User is not an administrator',
    type: ApiErrorDto,
  })
  async getUserDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<AdminUserDetailDto>> {
    const detail = await this.admin.getUserDetail(id);
    return apiOk('Admin user detail', detail);
  }

  /**
   * Lista las solicitudes de acceso (suscripciones y desbloqueos de idioma) para revisión.
   */
  @Get('requests')
  @ApiOperation({
    summary: 'List subscription and language-unlock access requests (admin only)',
  })
  @ApiOkResponseOfArray(AdminAccessRequestDto)
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'User is not an administrator',
    type: ApiErrorDto,
  })
  async listRequests(
    @Query() query: AdminRequestsQueryDto = {},
  ): Promise<ApiResponse<AdminAccessRequestDto[]>> {
    const list = await this.admin.listRequests(query);
    return apiOk('Admin access requests', list);
  }

  /**
   * Aprueba una solicitud pendiente, activa el beneficio al usuario y le envía correo de confirmación.
   */
  @Post('requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a pending access request and notify the user by email (admin only)',
  })
  @ApiOkResponseOf(ReviewAccessRequestResponseDto)
  @ApiNotFoundResponse({
    description: 'Access request not found',
    type: ApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Request was already reviewed (ACCESS_REQUEST_ALREADY_REVIEWED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'User is not an administrator',
    type: ApiErrorDto,
  })
  async approveRequest(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() _dto?: ApproveAccessRequestDto,
  ): Promise<ApiResponse<ReviewAccessRequestResponseDto>> {
    const result = await this.admin.approveRequest(admin.id, id);
    return apiOk('Access request approved', result);
  }

  /**
   * Rechaza una solicitud pendiente con un motivo obligatorio y lo envía al usuario por correo.
   */
  @Post('requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reject a pending access request with a reason and notify the user by email (admin only)',
  })
  @ApiOkResponseOf(ReviewAccessRequestResponseDto)
  @ApiBadRequestResponse({
    description: 'Missing or too short rejection reason',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Access request not found',
    type: ApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Request was already reviewed (ACCESS_REQUEST_ALREADY_REVIEWED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'User is not an administrator',
    type: ApiErrorDto,
  })
  async rejectRequest(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAccessRequestDto,
  ): Promise<ApiResponse<ReviewAccessRequestResponseDto>> {
    const result = await this.admin.rejectRequest(admin.id, id, dto.reason);
    return apiOk('Access request rejected', result);
  }
}
