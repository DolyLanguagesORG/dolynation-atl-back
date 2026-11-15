/**
 * Token de inyección para el cliente de Drizzle ORM.
 * Usa `@Inject(DRIZZLE)` para obtener la instancia tipada de base de datos.
 */
export const DRIZZLE = Symbol('DRIZZLE');
