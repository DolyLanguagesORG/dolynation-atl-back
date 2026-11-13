/**
 * Tipos públicos del servicio de correo transaccional.
 *
 * El servicio es agnóstico del proveedor: el transporte se configura por
 * variables de entorno (`SMTP_*`), de modo que Mailtrap Sandbox (desarrollo),
 * Brevo (staging/producción) y Mailpit (local) funcionan sin tocar el código.
 */

import {
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  isUiLocale,
  type UiLocale,
} from '../../common/types/locale';

/**
 * Locale de interfaz del usuario. Determina el idioma en que se redactan los
 * correos transaccionales.
 *
 * OJO: no confundir con el idioma de estudio (`LanguageId` = es/en/fr/it en
 * `settings.constants.ts`), que es una cosa distinta.
 */
export type MailLocale = UiLocale;

/** Lista inmutable de locales soportados por las plantillas de correo. */
export const MAIL_LOCALES: readonly MailLocale[] = SUPPORTED_UI_LOCALES;

/** Locale que se usa cuando el usuario no indica otro. */
export const DEFAULT_MAIL_LOCALE = DEFAULT_UI_LOCALE;

/** Verifica si un valor corresponde a un locale soportado. */
export function isMailLocale(value: unknown): value is MailLocale {
  return isUiLocale(value);
}

/** Mensaje de correo listo para enviar: asunto, cuerpo HTML y cuerpo en texto plano. */
export interface MailMessage {
  /** Destinatario. */
  to: string;
  /** Asunto del correo. */
  subject: string;
  /** Cuerpo renderizado en HTML. */
  html: string;
  /** Versión en texto plano (obligatoria: mejora la entregabilidad). */
  text: string;
}

/**
 * Contrato que debe cumplir todo transporte de correo.
 *
 * Permite sustituir el SMTP real por un doble en las pruebas sin tocar el
 * servicio de correo ni los flujos de autenticación.
 */
export interface MailTransport {
  /** Envía un mensaje. Lanza un error si el proveedor rechaza el envío. */
  send(message: MailMessage): Promise<void>;
  /** Comprueba que el transporte puede conectar con el servidor SMTP. */
  verify(): Promise<void>;
}
