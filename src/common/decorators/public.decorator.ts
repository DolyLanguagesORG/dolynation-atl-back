import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * `@Public()` — marca un controlador o endpoint como público (sin autenticación).
 * Trabaja en conjunto con el `JwtAuthGuard` global para excluir rutas como login,
 * registro, salud o documentación.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
