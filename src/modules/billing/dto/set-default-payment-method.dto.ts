import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Identificador del método de pago confirmado que se quiere asociar como predeterminado. */
export class SetDefaultPaymentMethodDto {
  @ApiProperty({
    example: 'pm_1234567890',
    description: 'Stripe PaymentMethod identifier obtained after confirming SetupIntent',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^pm_[A-Za-z0-9_]{3,124}$/, {
    message: 'paymentMethodId must be a valid Stripe PaymentMethod identifier (pm_...)',
  })
  paymentMethodId!: string;
}
