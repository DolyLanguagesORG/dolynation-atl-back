import { ApiProperty } from '@nestjs/swagger';

/** Resultado de recepción de un webhook, incluyendo si se ignoró por duplicado o entorno. */
export class WebhookProcessedResponseDto {
  @ApiProperty({
    example: true,
    description: 'Confirms receipt of the webhook event',
  })
  received!: boolean;

  @ApiProperty({
    example: false,
    description: 'True if the event was skipped (duplicate or different environment tag)',
  })
  ignored!: boolean;
}
