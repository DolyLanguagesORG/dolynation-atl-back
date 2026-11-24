import { SetMetadata } from '@nestjs/common';

/** Metadata for routes that accept anonymous access but authenticate a supplied Bearer token. */
export const OPTIONAL_AUTH_KEY = 'optional-auth';

/** Allows a route to continue without credentials while still populating `req.user` when present. */
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(OPTIONAL_AUTH_KEY, true);
