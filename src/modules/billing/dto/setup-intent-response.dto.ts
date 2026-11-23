import { ApiProperty } from '@nestjs/swagger';

/** Credenciales públicas necesarias para confirmar un SetupIntent desde Stripe.js. */
export class SetupIntentResponseDto {
  @ApiProperty({
    example: 'seti_1234567890',
    description: 'Stripe SetupIntent identifier',
  })
  setupIntentId!: string;

  @ApiProperty({
    example: 'seti_1234567890_secret_abc',
    description: 'Client secret for mounting Stripe PaymentElement in custom UI',
  })
  clientSecret!: string;

  @ApiProperty({
    example: 'pk_test_example',
    description: 'Stripe publishable key for Stripe.js initialization',
  })
  publishableKey!: string;
}
