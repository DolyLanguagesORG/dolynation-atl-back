import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { DEFAULT_INVOICES_LIMIT, MAX_INVOICES_LIMIT } from '../billing.constants';

/**
 * Parámetros opcionales de paginación para consultar el historial de facturas en Stripe.
 */
export class ListInvoicesQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_INVOICES_LIMIT,
    default: DEFAULT_INVOICES_LIMIT,
    example: DEFAULT_INVOICES_LIMIT,
    description: `Maximum number of recent invoices to return (default ${DEFAULT_INVOICES_LIMIT}, max ${MAX_INVOICES_LIMIT})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INVOICES_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    example: 'in_123456',
    description: 'Stripe invoice ID cursor for pagination (pass the last received invoice id)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^in_[A-Za-z0-9_]{3,128}$/)
  startingAfter?: string;
}
