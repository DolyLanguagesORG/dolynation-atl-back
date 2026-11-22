import { ApiProperty } from '@nestjs/swagger';

/**
 * Configuración pública de verificación anti-bot consumida por el frontend en runtime.
 */
export class CaptchaConfigResponseDto {
  @ApiProperty({
    example: true,
    description: 'Indica si la verificación anti-bot está activa en el ambiente actual',
  })
  enabled!: boolean;

  @ApiProperty({
    enum: ['disabled', 'turnstile'],
    example: 'turnstile',
    description: 'Proveedor anti-bot configurado en el servidor',
  })
  provider!: 'disabled' | 'turnstile';

  @ApiProperty({
    type: 'string',
    nullable: true,
    example: '1x00000000000000000000AA',
    description: 'Clave pública (Site Key) de Cloudflare Turnstile cuando está habilitado',
  })
  siteKey!: string | null;

  @ApiProperty({
    enum: ['interaction-only', 'always', 'execute'],
    example: 'interaction-only',
    description:
      'Modo de visibilidad del widget Turnstile (`interaction-only` permanece invisible para usuarios legítimos)',
  })
  appearance!: 'interaction-only' | 'always' | 'execute';
}
