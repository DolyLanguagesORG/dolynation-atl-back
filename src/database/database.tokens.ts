/**
 * Injection token for the Drizzle ORM client.
 * Use @Inject(DRIZZLE) to grab the typed database handle.
 */
export const DRIZZLE = Symbol('DRIZZLE');
