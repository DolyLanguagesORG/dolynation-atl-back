import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';
import { SUPPORTED_LANGUAGE_IDS } from '../settings.constants';

const LANGUAGE_IDS = [...SUPPORTED_LANGUAGE_IDS];

/**
 * DTO de entrada para guardar o reordenar la lista priorizada de idiomas seleccionados por el usuario.
 * El elemento en índice `0` representa el idioma de mayor prioridad.
 */
export class UpdateLanguageDto {
  @ApiProperty({
    type: [String],
    example: ['es', 'en'],
    description:
      'Ordered list of selected study language IDs (`index 0` = most important). Count must not exceed your plan limit.',
    enum: LANGUAGE_IDS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(LANGUAGE_IDS, { each: true })
  languages!: string[];
}
