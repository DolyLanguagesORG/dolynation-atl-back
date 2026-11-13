/**
 * Locale de interfaz del usuario.
 *
 * Es el idioma en el que se redactan los correos transaccionales y el que la
 * interfaz usa para sus propios textos. **No** es el idioma de estudio, que
 * vive en `user_settings.selected_languages` (`LanguageId` = es/en/fr/it).
 */

/** Locales de interfaz soportados por la aplicación. */
export const SUPPORTED_UI_LOCALES = ['es', 'en'] as const;

/** Unión de identificadores de locale de interfaz soportados. */
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

/** Locale que se aplica cuando el usuario no indica otro. */
export const DEFAULT_UI_LOCALE: UiLocale = 'es';

/** Verifica si un valor corresponde a un locale de interfaz soportado. */
export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (SUPPORTED_UI_LOCALES as readonly string[]).includes(value);
}
