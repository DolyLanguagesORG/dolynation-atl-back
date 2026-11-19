import { SetMetadata } from '@nestjs/common';

/** Clave de metadatos que marca rutas exclusivas para administradores en `AdminController`. */
export const IS_ADMIN_ONLY_KEY = 'isAdminOnly';

/** Clave de metadatos que permite a un administrador usar endpoints esenciales de sesión (`/auth/me`, `/auth/logout`). */
export const ALLOW_ADMIN_SESSION_KEY = 'allowAdminSession';

/** Marca un controlador o método como exclusivo del módulo de administración. */
export const AdminOnly = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_ADMIN_ONLY_KEY, true);

/** Permite que una sesión de administrador invoque el endpoint de identidad o cierre de sesión sin requerir suscripción. */
export const AllowAdminSession = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOW_ADMIN_SESSION_KEY, true);
