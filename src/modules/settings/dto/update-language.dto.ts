import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { SUPPORTED_LANGUAGE_IDS } from '../settings.constants';

const LANGUAGE_IDS = [...SUPPORTED_LANGUAGE_IDS];

/**
 * DTO de entrada para actualizar el idioma seleccionado por el usuario.
 */
export class UpdateLanguageDto {
  @ApiProperty({
    example: 'en',
    description: 'Identificador del idioma a guardar como selección del usuario',
    enum: LANGUAGE_IDS,
  })
  @IsString()
  @IsIn(LANGUAGE_IDS)
  language!: string;
}
