import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import { ApiOkResponseOfArray } from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminCategoryDto, AdminPromptLogDto, AdminUserRowDto } from './dto/admin-category.dto';

/**
 * Controlador para rutas de administración (`/admin`), protegido por `AdminGuard`.
 */
@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * Devuelve el catálogo global de categorías y subcategorías.
   */
  @Get('categories')
  @ApiOperation({
    summary: 'Listar todas las categorías globales (solo administradores)',
    description:
      'Devuelve el catálogo global de categorías junto con sus subcategorías. Modificar el catálogo requiere una tabla respaldada en el esquema (pendiente de seguimiento).',
  })
  @ApiOkResponseOfArray(AdminCategoryDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'El usuario no es administrador',
    type: ApiErrorDto,
  })
  listCategories(): ApiResponse<AdminCategoryDto[]> {
    return apiOk('Admin categories', this.admin.listCategories());
  }

  /**
   * Devuelve los fallos recientes del proveedor de IA (`prompt_logs`).
   *
   * Es la vía para ver **qué pasó de verdad** cuando una generación falla
   * (cuota agotada, timeout, respuesta que no parsea) sin entrar al servidor:
   * la API no filtra ese detalle al cliente final, pero aquí sí está.
   *
   * Solo para administradores.
   */
  @Get('prompt-logs')
  @ApiOperation({
    summary: 'Listar los fallos recientes del proveedor de IA',
    description:
      'Devuelve los registros de `prompt_logs` con el error original del provider. Es una herramienta de operación: el frontend no la usa.',
  })
  @ApiOkResponseOfArray(AdminPromptLogDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'El usuario no es administrador',
    type: ApiErrorDto,
  })
  async listPromptLogs(): Promise<ApiResponse<AdminPromptLogDto[]>> {
    return apiOk('Admin prompt logs', await this.admin.listPromptLogs());
  }

  /**
   * Devuelve el listado reciente de usuarios para supervisión administrativa.
   */
  @Get('users')
  @ApiOperation({ summary: 'Listar usuarios para supervisión (solo administradores)' })
  @ApiOkResponseOfArray(AdminUserRowDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiForbiddenResponse({
    description: 'El usuario no es administrador',
    type: ApiErrorDto,
  })
  async listUsers(): Promise<ApiResponse<AdminUserRowDto[]>> {
    const list = await this.admin.listUsers();
    return apiOk('Admin users', list);
  }
}
