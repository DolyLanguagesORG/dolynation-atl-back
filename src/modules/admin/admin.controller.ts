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
import { AdminCategoryDto, AdminUserRowDto } from './dto/admin-category.dto';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('categories')
  @ApiOperation({
    summary: 'List all global categories (admin-only)',
    description:
      'Returns the global catalog of categories with their subcategories. Mutating the catalog requires a schema-backed table — tracked as a follow-up.',
  })
  @ApiOkResponseOfArray(AdminCategoryDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'User is not an administrator', type: ApiErrorDto })
  listCategories(): ApiResponse<AdminCategoryDto[]> {
    return apiOk('Admin categories', this.admin.listCategories());
  }

  @Get('users')
  @ApiOperation({ summary: 'List users for supervision (admin-only)' })
  @ApiOkResponseOfArray(AdminUserRowDto)
  @ApiUnauthorizedResponse({ description: 'Missing or invalid auth', type: ApiErrorDto })
  @ApiForbiddenResponse({ description: 'User is not an administrator', type: ApiErrorDto })
  async listUsers(): Promise<ApiResponse<AdminUserRowDto[]>> {
    const list = await this.admin.listUsers();
    return apiOk('Admin users', list);
  }
}
