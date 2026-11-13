/**
 * Plantillas de los correos transaccionales.
 *
 * El diseño replica el sistema visual del frontend (`globals.css` y
 * `flowbite-theme.ts` del repo `dolynation-tonatiuh-front`): monocromo
 * editorial blanco y negro, tipografía serif para los titulares, antetítulo en
 * mayúsculas y CTA negro sobre blanco.
 *
 * Restricciones de los clientes de correo (Gmail, Outlook, Apple Mail):
 * - Solo tablas y CSS **inline**: nada de flex/grid ni media queries.
 * - `bgcolor` explícito en cada celda, para que el modo oscuro del cliente no
 *   invierta los colores y rompa el contraste.
 * - Cada correo lleva su versión en **texto plano** (obligatoria para la
 *   entregabilidad y para los clientes que no renderizan HTML).
 * - Las fuentes Geist/Newsreader no se pueden cargar desde el correo: se
 *   declaran primero en la pila por si el cliente las tiene instaladas, con
 *   fallback de sistema.
 */

import type { MailLocale } from './mail.types';

/** Paleta monocroma extraída del sistema de diseño del frontend. */
const COLORS = {
  background: '#fafafa',
  surface: '#ffffff',
  border: '#e5e5e5',
  foreground: '#0a0a0a',
  muted: '#525252',
  subtle: '#737373',
  brand: '#000000',
  onBrand: '#ffffff',
} as const;

/** Pilas de fuentes equivalentes a `--font-sans` y `--font-serif` del frontend. */
const FONTS = {
  body: "'Geist', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "'Newsreader', Georgia, Cambria, 'Times New Roman', serif",
} as const;

/** Ancho máximo de la tarjeta del correo. */
const CONTENT_WIDTH = '560px';

/** Datos de entrada del correo de confirmación de cuenta. */
export interface AccountConfirmationInput {
  /** Nombre completo del destinatario. Puede ser `null` si la cuenta no lo tiene. */
  fullName: string | null;
  /** Enlace público con el token de confirmación. */
  confirmationUrl: string;
}

/** Datos de entrada del correo de restablecimiento de contraseña. */
export interface PasswordResetInput {
  /** Nombre completo del destinatario. Puede ser `null` si la cuenta no lo tiene. */
  fullName: string | null;
  /** Enlace público con el token de restablecimiento. */
  resetUrl: string;
}

/** Correo renderizado, listo para enviarse. */
export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Textos de cada plantilla por locale.
 *
 * La voz es la del producto: tuteo, español neutro y sin emojis. Las mayúsculas
 * se reservan para el antetítulo y el CTA (igual que el badge `NUEVA LECTURA`
 * del frontend).
 */
interface TemplateCopy {
  readonly subject: string;
  readonly eyebrow: string;
  readonly headline: string;
  readonly greeting: string;
  readonly body: string;
  readonly cta: string;
  readonly fallback: string;
  readonly note: string;
  readonly footer: string;
}

const CONFIRMATION_COPY: Record<MailLocale, TemplateCopy> = {
  es: {
    subject: 'Confirma tu DolyCuenta — DolyNation',
    eyebrow: 'Edición académica',
    headline: 'Confirma tu DolyCuenta',
    greeting: 'Hola',
    body:
      'confirma tu correo para activar tu DolyCuenta y empezar a leer textos ' +
      'adaptados por inteligencia artificial a tu nivel lingüístico y tus objetivos.',
    cta: 'Confirmar mi cuenta',
    fallback: 'Si el botón no funciona, copia esta dirección en tu navegador:',
    note: 'Si no creaste esta cuenta, ignora este mensaje.',
    footer: 'DolyNation Editorial · Soporte académico · Términos de uso · Privacidad',
  },
  en: {
    subject: 'Confirm your DolyAccount — DolyNation',
    eyebrow: 'Academic edition',
    headline: 'Confirm your DolyAccount',
    greeting: 'Hi',
    body:
      'confirm your email to activate your DolyAccount and start reading texts ' +
      'adapted by artificial intelligence to your language level and goals.',
    cta: 'Confirm my account',
    fallback: 'If the button does not work, copy this address into your browser:',
    note: 'If you did not create this account, ignore this message.',
    footer: 'DolyNation Editorial · Academic support · Terms of use · Privacy',
  },
};

const PASSWORD_RESET_COPY: Record<MailLocale, TemplateCopy> = {
  es: {
    subject: 'Restablece tu contraseña — DolyNation',
    eyebrow: 'Edición académica',
    headline: 'Restablece tu contraseña',
    greeting: 'Hola',
    body:
      'recibimos una solicitud para restablecer la contraseña de tu DolyCuenta. ' +
      'El enlace es válido por 60 minutos y solo puede usarse una vez.',
    cta: 'Restablecer contraseña',
    fallback: 'Si el botón no funciona, copia esta dirección en tu navegador:',
    note: 'Si no solicitaste el cambio, ignora este mensaje: tu contraseña seguirá siendo la misma.',
    footer: 'DolyNation Editorial · Soporte académico · Términos de uso · Privacidad',
  },
  en: {
    subject: 'Reset your password — DolyNation',
    eyebrow: 'Academic edition',
    headline: 'Reset your password',
    greeting: 'Hi',
    body:
      'we received a request to reset the password of your DolyAccount. ' +
      'This link is valid for 60 minutes and can only be used once.',
    cta: 'Reset password',
    fallback: 'If the button does not work, copy this address into your browser:',
    note: 'If you did not request this change, ignore this message: your password will remain the same.',
    footer: 'DolyNation Editorial · Academic support · Terms of use · Privacy',
  },
};

/**
 * Escapa el contenido interpolado en el HTML.
 *
 * Es obligatorio porque `fullName` es texto libre introducido por el usuario:
 * sin escape, un nombre con `<` rompería el HTML del correo.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Construye el saludo con el nombre del usuario cuando lo hay. */
function buildGreeting(copy: TemplateCopy, fullName: string | null): string {
  const name = fullName?.trim() ?? '';
  return name.length > 0 ? `${copy.greeting} ${escapeHtml(name)},` : `${copy.greeting},`;
}

/** Renderiza el cuerpo HTML compartido por todas las plantillas. */
function renderHtml(options: {
  locale: MailLocale;
  copy: TemplateCopy;
  greeting: string;
  url: string;
}): string {
  const { locale, copy, greeting, url } = options;
  const safeUrl = escapeHtml(url);

  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.background};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${COLORS.background};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: ${CONTENT_WIDTH}; background-color: ${COLORS.surface}; border: 1px solid ${COLORS.border}; border-radius: 2px;">
            <tr>
              <td style="padding: 32px 32px 0 32px;">
                <p style="margin: 0 0 24px 0; font-family: ${FONTS.body}; font-size: 11px; font-weight: 700; line-height: 1.4; letter-spacing: 0.12em; text-transform: uppercase; color: ${COLORS.subtle};">
                  ${escapeHtml(copy.eyebrow)}
                </p>
                <h1 style="margin: 0 0 16px 0; font-family: ${FONTS.serif}; font-size: 26px; font-weight: 700; line-height: 1.25; color: ${COLORS.foreground};">
                  ${escapeHtml(copy.headline)}
                </h1>
                <p style="margin: 0 0 28px 0; font-family: ${FONTS.body}; font-size: 15px; line-height: 1.65; color: ${COLORS.muted};">
                  ${greeting} ${escapeHtml(copy.body)}
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 0 32px 28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${COLORS.brand}" style="background-color: ${COLORS.brand}; border: 1px solid ${COLORS.brand}; border-radius: 2px;">
                      <a href="${safeUrl}" style="display: inline-block; padding: 14px 28px; font-family: ${FONTS.body}; font-size: 12px; font-weight: 700; line-height: 1.4; letter-spacing: 0.08em; text-transform: uppercase; text-decoration: none; color: ${COLORS.onBrand};">
                        ${escapeHtml(copy.cta)}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 28px 32px;">
                <p style="margin: 0 0 8px 0; font-family: ${FONTS.body}; font-size: 12px; line-height: 1.6; color: ${COLORS.subtle};">
                  ${escapeHtml(copy.fallback)}
                </p>
                <p style="margin: 0; font-family: ${FONTS.body}; font-size: 12px; line-height: 1.6; word-break: break-all;">
                  <a href="${safeUrl}" style="color: ${COLORS.muted}; text-decoration: underline;">${safeUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 28px 32px;">
                <p style="margin: 0; font-family: ${FONTS.body}; font-size: 12px; line-height: 1.6; color: ${COLORS.muted};">
                  ${escapeHtml(copy.note)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px 32px 32px; border-top: 1px solid ${COLORS.border};">
                <p style="margin: 0; font-family: ${FONTS.body}; font-size: 12px; line-height: 1.6; color: ${COLORS.subtle};">
                  ${escapeHtml(copy.footer)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Renderiza la versión en texto plano del correo. */
function renderText(copy: TemplateCopy, greeting: string, url: string): string {
  return [
    copy.headline,
    '',
    `${greeting} ${copy.body}`,
    '',
    `${copy.cta.toUpperCase()}: ${url}`,
    '',
    copy.fallback,
    url,
    '',
    copy.note,
    '',
    copy.footer,
  ].join('\n');
}

/**
 * Renderiza el correo de confirmación de cuenta.
 *
 * @param locale Locale del destinatario.
 * @param input Nombre del usuario y enlace de confirmación.
 */
export function renderAccountConfirmation(
  locale: MailLocale,
  input: AccountConfirmationInput,
): RenderedMail {
  const copy = CONFIRMATION_COPY[locale];
  const greeting = buildGreeting(copy, input.fullName);
  return {
    subject: copy.subject,
    html: renderHtml({ locale, copy, greeting, url: input.confirmationUrl }),
    text: renderText(copy, greeting, input.confirmationUrl),
  };
}

/**
 * Renderiza el correo de restablecimiento de contraseña.
 *
 * @param locale Locale del destinatario.
 * @param input Nombre del usuario y enlace de restablecimiento.
 */
export function renderPasswordReset(locale: MailLocale, input: PasswordResetInput): RenderedMail {
  const copy = PASSWORD_RESET_COPY[locale];
  const greeting = buildGreeting(copy, input.fullName);
  return {
    subject: copy.subject,
    html: renderHtml({ locale, copy, greeting, url: input.resetUrl }),
    text: renderText(copy, greeting, input.resetUrl),
  };
}
