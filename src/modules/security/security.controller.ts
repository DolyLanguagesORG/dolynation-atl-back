import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiOkResponseOf } from '../../common/types/api-envelope.decorators';
import { apiOk, type ApiResponse } from '../../common/types/api-response.type';
import { CaptchaService } from './captcha.service';
import { CaptchaConfigResponseDto } from './dto/captcha-config-response.dto';

/**
 * Endpoints públicos de configuración de seguridad en runtime (`/security`).
 */
@ApiTags('security')
@Controller('security')
export class SecurityController {
  constructor(private readonly captcha: CaptchaService) {}

  /**
   * Expone si Cloudflare Turnstile está habilitado y su clave pública (`siteKey`)
   * para que una misma imagen de frontend funcione en cualquier ambiente sin recompilar.
   */
  @Public()
  @Get('captcha/config')
  @ApiOperation({
    summary: 'Get public anti-bot CAPTCHA runtime configuration and Turnstile site key',
  })
  @ApiOkResponseOf(CaptchaConfigResponseDto)
  getCaptchaConfig(): ApiResponse<CaptchaConfigResponseDto> {
    return apiOk('Captcha configuration', this.captcha.getPublicConfig());
  }
}
