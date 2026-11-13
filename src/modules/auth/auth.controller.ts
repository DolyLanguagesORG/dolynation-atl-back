import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import {
  AuthResponseDto,
  AuthTokensDto,
  AuthUserViewDto,
} from '../../common/types/api-response.dto';
import {
  ApiCreatedResponseOf,
  ApiOkResponseEmpty,
  ApiOkResponseOf,
} from '../../common/types/api-envelope.decorators';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';

/**
 * Controlador de autenticación y gestión de sesiones (`/auth`).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Registra un usuario nuevo y devuelve su perfil público junto con el par de tokens.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear una nueva cuenta y devolver tokens de acceso y actualización',
  })
  @ApiCreatedResponseOf(AuthResponseDto)
  @ApiConflictResponse({
    description: 'El correo electrónico ya está en uso',
    type: ApiErrorDto,
  })
  @ApiBadRequestResponse({ description: 'Error de validación', type: ApiErrorDto })
  async register(@Body() dto: RegisterDto): Promise<ApiResponse<AuthResponseDto>> {
    const result = await this.auth.register(dto);
    return apiOk('User registered successfully', result as unknown as AuthResponseDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar usuario con correo electrónico y contraseña' })
  @ApiOkResponseOf(AuthResponseDto)
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas', type: ApiErrorDto })
  @ApiBadRequestResponse({ description: 'Error de validación', type: ApiErrorDto })
  async login(@Body() dto: LoginDto): Promise<ApiResponse<AuthResponseDto>> {
    const result = await this.auth.login(dto);
    return apiOk('Login successful', result as unknown as AuthResponseDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Intercambiar un refresh token por un nuevo par de tokens de acceso y actualización',
  })
  @ApiOkResponseOf(AuthTokensDto)
  @ApiUnauthorizedResponse({
    description: 'Refresh token inválido o expirado',
    type: ApiErrorDto,
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<ApiResponse<AuthTokensDto>> {
    const tokens = await this.auth.refresh(dto.refreshToken);
    return apiOk('Token refreshed', tokens);
  }

  @ApiBearerAuth('access-token')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar la sesión actual invalidando su refresh token',
  })
  @ApiOkResponseEmpty()
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  @ApiBadRequestResponse({ description: 'Error de validación', type: ApiErrorDto })
  async logout(
    @CurrentUser() current: AuthUser,
    @Body() dto: RefreshTokenDto,
  ): Promise<ApiResponse<null>> {
    await this.auth.logout(current.id, dto.refreshToken);
    return apiOk('Logged out', null);
  }

  @ApiBearerAuth('access-token')
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar todas las sesiones invalidando todos los refresh tokens del usuario',
  })
  @ApiOkResponseEmpty()
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async logoutAll(@CurrentUser() current: AuthUser): Promise<ApiResponse<null>> {
    await this.auth.logoutAll(current.id);
    return apiOk('Logged out from all sessions', null);
  }

  @ApiBearerAuth('access-token')
  @Get('me')
  @ApiOperation({ summary: 'Devolver el perfil público del usuario autenticado actual' })
  @ApiOkResponseOf(AuthUserViewDto)
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async me(@CurrentUser() current: AuthUser): Promise<ApiResponse<AuthUserViewDto>> {
    const user = await this.auth.me(current.id);
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }
    return apiOk('Current user', user as unknown as AuthUserViewDto);
  }
}
