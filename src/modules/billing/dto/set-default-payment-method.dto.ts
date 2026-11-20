import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetDefaultPaymentMethodDto {
  @ApiProperty({
    example: 'pm_1234567890',
    description: 'Stripe PaymentMethod identifier obtained after confirming SetupIntent',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  paymentMethodId!: string;
}
