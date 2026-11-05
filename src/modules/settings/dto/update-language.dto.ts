import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { SUPPORTED_LANGUAGE_IDS } from '../settings.constants';

const LANGUAGE_IDS = [...SUPPORTED_LANGUAGE_IDS];

export class UpdateLanguageDto {
  @ApiProperty({
    example: 'en',
    description: 'Language id to persist as the user’s selection',
    enum: LANGUAGE_IDS,
  })
  @IsString()
  @IsIn(LANGUAGE_IDS)
  language!: string;
}
