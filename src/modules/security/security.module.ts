import { Global, Module } from '@nestjs/common';
import { LogsModule } from '../logs';
import { CaptchaGuard } from './captcha.guard';
import { CaptchaService } from './captcha.service';
import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { IpRateLimitService } from './ip-rate-limit.service';
import { SecurityController } from './security.controller';

/**
 * Módulo global de seguridad anti-bot (Cloudflare Turnstile) y limitación por IP.
 */
@Global()
@Module({
  imports: [LogsModule],
  controllers: [SecurityController],
  providers: [CaptchaService, IpRateLimitService, CaptchaGuard, IpRateLimitGuard],
  exports: [CaptchaService, IpRateLimitService, CaptchaGuard, IpRateLimitGuard],
})
export class SecurityModule {}
