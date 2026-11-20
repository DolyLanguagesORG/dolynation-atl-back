import { ApiProperty } from '@nestjs/swagger';

export class BillingInvoiceDto {
  @ApiProperty({ example: 'in_123456', description: 'Stripe Invoice identifier' })
  id!: string;

  @ApiProperty({
    example: 'DOLY-0001',
    nullable: true,
    description: 'Human-readable invoice number',
  })
  number!: string | null;

  @ApiProperty({ example: 'paid', nullable: true, description: 'Invoice status' })
  status!: string | null;

  @ApiProperty({ example: 9900, description: 'Amount paid in smallest currency unit' })
  amountPaidCents!: number;

  @ApiProperty({ example: 9900, description: 'Amount due in smallest currency unit' })
  amountDueCents!: number;

  @ApiProperty({ example: 'mxn', description: 'ISO 4217 currency code' })
  currency!: string;

  @ApiProperty({ example: '2026-11-20T10:00:00.000Z', description: 'Invoice creation timestamp' })
  createdAt!: Date;

  @ApiProperty({
    example: 'https://pay.stripe.com/invoice/acct/pdf',
    nullable: true,
    description: 'Direct PDF download URL provided by Stripe',
  })
  invoicePdfUrl!: string | null;

  @ApiProperty({
    example: 'https://invoice.stripe.com/i/acct',
    nullable: true,
    description: 'Hosted Stripe invoice view URL',
  })
  hostedInvoiceUrl!: string | null;
}
