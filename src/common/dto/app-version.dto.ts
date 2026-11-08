import { ApiProperty } from '@nestjs/swagger';

/**
 * Identificación del build en ejecución.
 *
 * Es lo que devuelve `GET /api/v1/version` y lo que va en la cabecera
 * `X-App-Version`. Permite auditar qué versión está respondiendo sin
 * depender de la base de datos ni de ningún servicio externo.
 */
export class AppVersionDto {
  @ApiProperty({
    example: '0.2.2',
    description:
      'Versión única de la aplicación (la que compone versions.yml). La inyecta el despliegue.',
  })
  appVersion!: string;

  @ApiProperty({
    example: 'dolynation-atl-back',
    description: 'Componente de la aplicación que responde a esta petición.',
  })
  component!: string;

  @ApiProperty({
    example: '0.2.2',
    description: 'Versión de este repositorio.',
  })
  version!: string;

  @ApiProperty({
    example: 'bd1e7a4e3487117d1249bfed4ffaa5f33e89b8cf',
    description: 'SHA exacto del código desplegado.',
  })
  commit!: string;

  @ApiProperty({
    example: '2026-11-07T14:42:25.000Z',
    description:
      'Momento de la construcción del artefacto. Sin BUILT_AT, la hora de arranque del proceso.',
  })
  builtAt!: string;
}
