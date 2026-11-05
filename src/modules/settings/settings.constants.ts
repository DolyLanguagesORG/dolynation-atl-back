/**
 * Supported study languages for the Dolynglish app.
 * These are the surface languages the user can switch between in the UI,
 * not the CEFR levels (which belong to the reading generation flow).
 */
export const SUPPORTED_LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'pt', name: 'Português' },
  { id: 'de', name: 'Deutsch' },
] as const;

export type LanguageId = (typeof SUPPORTED_LANGUAGES)[number]['id'];

export const SUPPORTED_LANGUAGE_IDS: readonly LanguageId[] = SUPPORTED_LANGUAGES.map((l) => l.id);

export const DEFAULT_LANGUAGE: LanguageId = 'en';
