/** Roles válidos del sistema definidos en la tabla `roles`. */
export const USER_ROLES = ['student', 'admin'] as const;

/** Rol tipado asignado a una cuenta de usuario. */
export type UserRole = (typeof USER_ROLES)[number];

/** Rol predeterminado para las cuentas registradas por el flujo estándar. */
export const DEFAULT_USER_ROLE: UserRole = 'student';

/** Comprueba si un valor desconocido corresponde a un `UserRole` reconocido. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
