/**
 * Idiomas de estudio soportados por la aplicación Dolynglish.
 * Los usuarios pueden seleccionar 1, 2 o 4 idiomas según su plan de suscripción.
 */
export const SUPPORTED_LANGUAGES = [
  { id: 'es', name: 'Español' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'it', name: 'Italiano' },
] as const;

/** Unión de identificadores de idiomas soportados. */
export type LanguageId = (typeof SUPPORTED_LANGUAGES)[number]['id'];

/** Lista inmutable de códigos de idioma válidos. */
export const SUPPORTED_LANGUAGE_IDS: readonly LanguageId[] = SUPPORTED_LANGUAGES.map((l) => l.id);

/** Cantidad mínima de categorías temáticas requeridas en el perfil del usuario. */
export const MIN_USER_CATEGORIES = 3;

/** Días de espera entre cambios gratuitos de idioma seleccionado. */
export const LANGUAGE_CHANGE_COOLDOWN_DAYS = 365;

/** Duración en milisegundos del bloqueo anual para cambiar idioma sin pago. */
export const LANGUAGE_CHANGE_COOLDOWN_MS = LANGUAGE_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/** Verifica si un valor corresponde a un identificador de idioma soportado. */
export function isSupportedLanguageId(value: unknown): value is LanguageId {
  return typeof value === 'string' && (SUPPORTED_LANGUAGE_IDS as readonly string[]).includes(value);
}
