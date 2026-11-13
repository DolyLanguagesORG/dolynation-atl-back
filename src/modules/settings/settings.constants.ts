/**
 * Idiomas de estudio soportados por la aplicación Dolynglish.
 * Representan los idiomas de interfaz/estudio entre los que puede cambiar el usuario en la UI,
 * no los niveles CEFR (que pertenecen al flujo de generación de lecturas).
 */
export const SUPPORTED_LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'pt', name: 'Português' },
  { id: 'de', name: 'Deutsch' },
] as const;

/** Unión de identificadores de idiomas soportados. */
export type LanguageId = (typeof SUPPORTED_LANGUAGES)[number]['id'];

/** Lista inmutable de códigos de idioma válidos. */
export const SUPPORTED_LANGUAGE_IDS: readonly LanguageId[] = SUPPORTED_LANGUAGES.map((l) => l.id);

/** Idioma predeterminado cuando el usuario aún no ha elegido preferencia. */
export const DEFAULT_LANGUAGE: LanguageId = 'en';
