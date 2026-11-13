import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/errors/api-error.dto';
import {
  AuthResponseDto,
  AuthTokensDto,
  AuthUserViewDto,
  EmailSentDto,
  EmailVerifiedDto,
  PasswordUpdatedDto,
  RegisterResponseDto,
} from '../../common/types/api-response.dto';
import {
  ApiCreatedResponseOf,
  ApiOkResponseEmpty,
  ApiOkResponseOf,
} from '../../common/types/api-envelope.decorators';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AllowWithoutSubscription } from '../../common/decorators/allow-without-subscription.decorator';
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
   *
   * Cuando la verificación de correo es obligatoria, `tokens` llega `null` y el
   * usuario debe confirmar su correo antes de poder iniciar sesión.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new account and return access and refresh tokens',
    description:
      'When email verification is required, `tokens` is `null` and `emailVerificationRequired` is `true`: the account must confirm its email address before signing in.',
  })
  @ApiCreatedResponseOf(RegisterResponseDto)
  @ApiConflictResponse({
    description: 'El correo electrónico ya está en uso',
    type: ApiErrorDto,
  })
  @ApiBadRequestResponse({ description: 'Error de validación', type: ApiErrorDto })
  async register(@Body() dto: RegisterDto): Promise<ApiResponse<RegisterResponseDto>> {
    const result = await this.auth.register(dto);
    return apiOk('User registered successfully', result);
  }

  /**
   * Confirma el correo de una cuenta con el token recibido por correo.
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the email address of an account',
    description:
      'Consumes the single-use token delivered by email. The token expires 24 hours after it was issued.',
  })
  @ApiOkResponseOf(EmailVerifiedDto)
  @ApiBadRequestResponse({
    description: 'The token is invalid, expired or has already been used',
    type: ApiErrorDto,
  })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<ApiResponse<EmailVerifiedDto>> {
    const result = await this.auth.verifyEmail(dto.token);
    return apiOk('Email verified successfully', result);
  }

  /**
   * Solicita el envío del correo de restablecimiento de contraseña.
   *
   * La respuesta es idéntica exista o no la cuenta, para no permitir enumerar
   * los correos registrados.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'The response is always the same, whether or not the account exists, so that registered email addresses cannot be discovered.',
  })
  @ApiOkResponseOf(EmailSentDto)
  @ApiBadRequestResponse({ description: 'Error de validación', type: ApiErrorDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ApiResponse<EmailSentDto>> {
    const result = await this.auth.forgotPassword(dto.email);
    return apiOk('If the account exists, a password reset email has been sent', result);
  }

  /**
   * Reenvía el correo de confirmación de cuenta si esta sigue sin verificarse.
   */
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the account confirmation email',
    description:
      'The response is always the same, whether or not the account exists or is already verified.',
  })
  @ApiOkResponseOf(EmailSentDto)
  @ApiBadRequestResponse({ description: 'Error de validación', type: ApiErrorDto })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<ApiResponse<EmailSentDto>> {
    const result = await this.auth.resendVerification(dto.email);
    return apiOk(
      'If the account exists and is unverified, a confirmation email has been sent',
      result,
    );
  }

  /**
   * Establece una nueva contraseña usando un token de restablecimiento válido.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password using a password reset token',
    description:
      'The token is single-use and expires 60 minutes after it was issued. All active sessions of the account are revoked.',
  })
  @ApiOkResponseOf(PasswordUpdatedDto)
  @ApiBadRequestResponse({
    description: 'The token is invalid, expired or has already been used',
    type: ApiErrorDto,
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<ApiResponse<PasswordUpdatedDto>> {
    const result = await this.auth.resetPassword(dto.token, dto.password);
    return apiOk('Password updated successfully', result);
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
    return apiOk('Login successful', result);
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
  @AllowWithoutSubscription()
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
  @AllowWithoutSubscription()
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
  @ApiForbiddenResponse({
    description: 'Se requiere una suscripción activa (SUBSCRIPTION_REQUIRED)',
    type: ApiErrorDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Autenticación faltante o inválida',
    type: ApiErrorDto,
  })
  async me(@CurrentUser() current: AuthUser): Promise<ApiResponse<AuthUserViewDto>> {
    const user = await this.auth.me(current.id);
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }
    return apiOk('Current user', user);
  }
}
