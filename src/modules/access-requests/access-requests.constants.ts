/** Tipos de solicitud de acceso gestionados mediante aprobación administrativa. */
export const ACCESS_REQUEST_TYPES = ['subscription', 'language_unlock'] as const;

/** Estados posibles de una solicitud de acceso. */
export const ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

/** Tipo de solicitud de acceso (`subscription` | `language_unlock`). */
export type AccessRequestType = (typeof ACCESS_REQUEST_TYPES)[number];

/** Estado actual de la solicitud de acceso. */
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];
