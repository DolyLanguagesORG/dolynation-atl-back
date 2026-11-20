import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { BILLING_UI_MODES, type BillingUiMode } from '../billing.constants';

export class CreateLanguageUnlockCheckoutDto {
  @ApiPropertyOptional({
    example: 'custom',
    enum: BILLING_UI_MODES,
    description: 'Optional checkout UI mode override (custom or hosted)',
  })
  @IsOptional()
  @IsIn([...BILLING_UI_MODES])
  uiMode?: BillingUiMode;
}
