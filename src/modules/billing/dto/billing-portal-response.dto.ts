import { ApiProperty } from '@nestjs/swagger';

/** URL temporal para abrir el portal de autoservicio de facturación de Stripe. */
export class BillingPortalResponseDto {
  @ApiProperty({
    example: 'https://billing.stripe.com/p/session/test_123',
    description: 'Short-lived Stripe Customer Portal URL (optional fallback)',
  })
  url!: string;
}
