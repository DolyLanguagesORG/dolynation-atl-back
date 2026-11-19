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

/** Datos de entrada del correo cuando el administrador aprueba una solicitud de acceso. */
export interface AccessRequestApprovedInput {
  fullName: string | null;
  requestType: 'subscription' | 'language_unlock';
  planName: string | null;
  actionUrl: string;
}

/** Datos de entrada del correo cuando el administrador rechaza una solicitud de acceso. */
export interface AccessRequestRejectedInput {
  fullName: string | null;
  requestType: 'subscription' | 'language_unlock';
  planName: string | null;
  reason: string;
  actionUrl: string;
}

/** Datos de entrada del aviso opcional al administrador cuando entra una nueva solicitud. */
export interface AdminAccessRequestNoticeInput {
  requesterName: string | null;
  requesterEmail: string;
  requestType: 'subscription' | 'language_unlock';
  planName: string | null;
  userMessage: string | null;
  adminUrl: string;
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
  fr: {
    subject: 'Confirmez votre DolyCompte — DolyNation',
    eyebrow: 'Édition académique',
    headline: 'Confirmez votre DolyCompte',
    greeting: 'Bonjour',
    body:
      'confirmez votre adresse e-mail pour activer votre DolyCompte et commencer à lire des textes ' +
      'adaptés par intelligence artificielle à votre niveau linguistique et à vos objectifs.',
    cta: 'Confirmer mon compte',
    fallback: 'Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :',
    note: "Si vous n'avez pas créé ce compte, ignorez ce message.",
    footer:
      "DolyNation Éditorial · Support académique · Conditions d'utilisation · Confidentialité",
  },
  it: {
    subject: 'Conferma il tuo DolyAccount — DolyNation',
    eyebrow: 'Edizione accademica',
    headline: 'Conferma il tuo DolyAccount',
    greeting: 'Ciao',
    body:
      'conferma la tua email per attivare il tuo DolyAccount e iniziare a leggere testi ' +
      "adattati dall'intelligenza artificiale al tuo livello linguistico e ai tuoi obiettivi.",
    cta: 'Conferma il mio account',
    fallback: 'Se il pulsante non funziona, copia questo indirizzo nel tuo browser:',
    note: 'Se non hai creato questo account, ignora questo messaggio.',
    footer: "DolyNation Editoriale · Supporto accademico · Termini d'uso · Privacy",
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
  fr: {
    subject: 'Réinitialisez votre mot de passe — DolyNation',
    eyebrow: 'Édition académique',
    headline: 'Réinitialisez votre mot de passe',
    greeting: 'Bonjour',
    body:
      'nous avons reçu une demande de réinitialisation du mot de passe de votre DolyCompte. ' +
      "Ce lien est valable pendant 60 minutes et ne peut être utilisé qu'une seule fois.",
    cta: 'Réinitialiser le mot de passe',
    fallback: 'Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :',
    note:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : " +
      'votre mot de passe restera inchangé.',
    footer:
      "DolyNation Éditorial · Support académique · Conditions d'utilisation · Confidentialité",
  },
  it: {
    subject: 'Reimposta la tua password — DolyNation',
    eyebrow: 'Edizione accademica',
    headline: 'Reimposta la tua password',
    greeting: 'Ciao',
    body:
      'abbiamo ricevuto una richiesta per reimpostare la password del tuo DolyAccount. ' +
      'Questo link è valido per 60 minuti e può essere utilizzato una sola volta.',
    cta: 'Reimposta password',
    fallback: 'Se il pulsante non funziona, copia questo indirizzo nel tuo browser:',
    note:
      'Se non hai richiesto questa modifica, ignora questo messaggio: ' +
      'la tua password resterà invariata.',
    footer: "DolyNation Editoriale · Supporto accademico · Termini d'uso · Privacy",
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
  calloutHtml?: string;
}): string {
  const { locale, copy, greeting, url, calloutHtml = '' } = options;
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
                <p style="margin: 0 0 24px 0; font-family: ${FONTS.body}; font-size: 15px; line-height: 1.65; color: ${COLORS.muted};">
                  ${greeting} ${escapeHtml(copy.body)}
                </p>
                ${calloutHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 4px 32px 28px 32px;">
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

/** Construye un recuadro editorial en HTML para resaltar motivos o detalles de solicitud. */
function renderCalloutBox(label: string, content: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px 0; background-color: ${COLORS.background}; border: 1px solid ${COLORS.border}; border-left: 3px solid ${COLORS.brand};">
    <tr>
      <td style="padding: 14px 16px;">
        <p style="margin: 0 0 6px 0; font-family: ${FONTS.body}; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${COLORS.subtle};">
          ${escapeHtml(label)}
        </p>
        <p style="margin: 0; font-family: ${FONTS.body}; font-size: 14px; line-height: 1.6; color: ${COLORS.foreground};">
          ${escapeHtml(content)}
        </p>
      </td>
    </tr>
  </table>`;
}

/** Renderiza la versión en texto plano del correo. */
function renderText(
  copy: TemplateCopy,
  greeting: string,
  url: string,
  extraLines: string[] = [],
): string {
  return [
    copy.headline,
    '',
    `${greeting} ${copy.body}`,
    ...(extraLines.length > 0 ? ['', ...extraLines] : []),
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

interface RequestMailStrings {
  readonly eyebrow: string;
  readonly greeting: string;
  readonly fallback: string;
  readonly footer: string;
  readonly approvedSubSubject: string;
  readonly approvedSubHeadline: string;
  readonly approvedSubBody: (plan: string) => string;
  readonly approvedSubCta: string;
  readonly approvedSubNote: string;
  readonly approvedLangSubject: string;
  readonly approvedLangHeadline: string;
  readonly approvedLangBody: string;
  readonly approvedLangCta: string;
  readonly approvedLangNote: string;
  readonly rejectedSubject: string;
  readonly rejectedHeadline: string;
  readonly rejectedSubBody: (plan: string) => string;
  readonly rejectedLangBody: string;
  readonly rejectedReasonLabel: string;
  readonly rejectedCta: string;
  readonly rejectedNote: string;
  readonly adminNoticeSubject: (email: string) => string;
  readonly adminNoticeHeadline: string;
  readonly adminNoticeSubBody: (requester: string, plan: string) => string;
  readonly adminNoticeLangBody: (requester: string) => string;
  readonly adminNoticeMessageLabel: string;
  readonly adminNoticeNoMessage: string;
  readonly adminNoticeCta: string;
  readonly adminNoticeNote: string;
}

const REQUEST_STRINGS: Record<MailLocale, RequestMailStrings> = {
  es: {
    eyebrow: 'Edición académica',
    greeting: 'Hola',
    fallback: 'Si el botón no funciona, copia esta dirección en tu navegador:',
    footer: 'DolyNation Editorial · Soporte académico · Términos de uso · Privacidad',
    approvedSubSubject: 'Tu solicitud fue aprobada — DolyNation',
    approvedSubHeadline: 'Felicidades, tu solicitud fue aprobada',
    approvedSubBody: (plan) =>
      `tu solicitud para el plan ${plan} fue aprobada por el equipo de DolyNation. Ya puedes entrar a configurar tus preferencias y comenzar a generar lecturas.`,
    approvedSubCta: 'Ir a DolyNation',
    approvedSubNote: 'Gracias por probar DolyNation y acompañarnos en esta etapa.',
    approvedLangSubject: 'Cambio de idioma desbloqueado — DolyNation',
    approvedLangHeadline: 'Tu desbloqueo de idioma fue aprobado',
    approvedLangBody:
      'aprobamos tu solicitud de desbloqueo de idioma. Ya tienes 1 crédito disponible en tu perfil para cambiar tu idioma de estudio de inmediato.',
    approvedLangCta: 'Configurar idiomas',
    approvedLangNote: 'Ingresa a tu perfil para aplicar el cambio de idioma cuando lo necesites.',
    rejectedSubject: 'Actualización sobre tu solicitud — DolyNation',
    rejectedHeadline: 'Tu solicitud no fue aprobada en esta ocasión',
    rejectedSubBody: (plan) =>
      `revisamos tu solicitud para el plan ${plan}, pero en esta ocasión no pudimos aprobarla.`,
    rejectedLangBody:
      'revisamos tu solicitud para desbloquear el cambio de idioma, pero en esta ocasión no pudimos aprobarla.',
    rejectedReasonLabel: 'Motivo indicado por el administrador',
    rejectedCta: 'Volver a DolyNation',
    rejectedNote:
      'Si deseas intentarlo de nuevo o enviar más detalles, puedes hacerlo desde tu cuenta.',
    adminNoticeSubject: (email) => `Nueva solicitud de acceso (${email}) — DolyNation`,
    adminNoticeHeadline: 'Nueva solicitud pendiente de revisión',
    adminNoticeSubBody: (requester, plan) =>
      `el usuario ${requester} solicitó acceso al plan ${plan}.`,
    adminNoticeLangBody: (requester) =>
      `el usuario ${requester} solicitó un desbloqueo de cambio de idioma.`,
    adminNoticeMessageLabel: 'Mensaje del usuario',
    adminNoticeNoMessage: 'Sin mensaje adicional.',
    adminNoticeCta: 'Revisar en el panel admin',
    adminNoticeNote:
      'Puedes aprobar o rechazar esta solicitud desde el módulo de usuarios y solicitudes.',
  },
  en: {
    eyebrow: 'Academic edition',
    greeting: 'Hi',
    fallback: 'If the button does not work, copy this address into your browser:',
    footer: 'DolyNation Editorial · Academic support · Terms of use · Privacy',
    approvedSubSubject: 'Your request was approved — DolyNation',
    approvedSubHeadline: 'Congratulations, your request was approved',
    approvedSubBody: (plan) =>
      `your request for the ${plan} plan has been approved by the DolyNation team. You can now sign in, configure your preferences, and start generating readings.`,
    approvedSubCta: 'Open DolyNation',
    approvedSubNote: 'Thank you for testing DolyNation with us.',
    approvedLangSubject: 'Language change unlocked — DolyNation',
    approvedLangHeadline: 'Your language unlock was approved',
    approvedLangBody:
      'we approved your language change unlock request. You now have 1 credit available in your profile to update your study language right away.',
    approvedLangCta: 'Configure languages',
    approvedLangNote: 'Visit your profile whenever you are ready to apply the language change.',
    rejectedSubject: 'Update on your request — DolyNation',
    rejectedHeadline: 'Your request could not be approved this time',
    rejectedSubBody: (plan) =>
      `we reviewed your request for the ${plan} plan, but we were unable to approve it at this time.`,
    rejectedLangBody:
      'we reviewed your language change unlock request, but we were unable to approve it at this time.',
    rejectedReasonLabel: 'Reason provided by the administrator',
    rejectedCta: 'Return to DolyNation',
    rejectedNote:
      'If you would like to submit a new request with more context, you can do so from your account.',
    adminNoticeSubject: (email) => `New access request (${email}) — DolyNation`,
    adminNoticeHeadline: 'New request awaiting review',
    adminNoticeSubBody: (requester, plan) =>
      `user ${requester} requested access to the ${plan} plan.`,
    adminNoticeLangBody: (requester) => `user ${requester} requested a language change unlock.`,
    adminNoticeMessageLabel: 'User message',
    adminNoticeNoMessage: 'No additional message provided.',
    adminNoticeCta: 'Review in admin panel',
    adminNoticeNote:
      'You can approve or reject this request from the users and requests dashboard.',
  },
  fr: {
    eyebrow: 'Édition académique',
    greeting: 'Bonjour',
    fallback: 'Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :',
    footer:
      "DolyNation Éditorial · Support académique · Conditions d'utilisation · Confidentialité",
    approvedSubSubject: 'Votre demande a été approuvée — DolyNation',
    approvedSubHeadline: 'Félicitations, votre demande a été approuvée',
    approvedSubBody: (plan) =>
      `votre demande pour le forfait ${plan} a été approuvée par l'équipe DolyNation. Vous pouvez maintenant configurer vos préférences et générer vos lectures.`,
    approvedSubCta: 'Accéder à DolyNation',
    approvedSubNote: "Merci d'essayer DolyNation avec nous.",
    approvedLangSubject: 'Changement de langue débloqué — DolyNation',
    approvedLangHeadline: 'Votre déblocage de langue a été approuvé',
    approvedLangBody:
      "nous avons approuvé votre demande de déblocage de langue. Vous disposez maintenant d'un crédit dans votre profil pour modifier votre langue d'étude.",
    approvedLangCta: 'Configurer les langues',
    approvedLangNote: 'Rendez-vous sur votre profil pour appliquer le changement.',
    rejectedSubject: 'Mise à jour de votre demande — DolyNation',
    rejectedHeadline: "Votre demande n'a pas pu être approuvée",
    rejectedSubBody: (plan) =>
      `nous avons examiné votre demande pour le forfait ${plan}, mais nous ne pouvons pas l'approuver pour le moment.`,
    rejectedLangBody:
      "nous avons examiné votre demande de déblocage de langue, mais nous ne pouvons pas l'approuver pour le moment.",
    rejectedReasonLabel: "Motif indiqué par l'administrateur",
    rejectedCta: 'Retourner sur DolyNation',
    rejectedNote: 'Vous pouvez soumettre une nouvelle demande depuis votre compte.',
    adminNoticeSubject: (email) => `Nouvelle demande d'accès (${email}) — DolyNation`,
    adminNoticeHeadline: 'Nouvelle demande en attente',
    adminNoticeSubBody: (requester, plan) =>
      `l'utilisateur ${requester} a demandé l'accès au forfait ${plan}.`,
    adminNoticeLangBody: (requester) =>
      `l'utilisateur ${requester} a demandé un déblocage de changement de langue.`,
    adminNoticeMessageLabel: "Message de l'utilisateur",
    adminNoticeNoMessage: 'Aucun message supplémentaire.',
    adminNoticeCta: 'Examiner dans le panneau admin',
    adminNoticeNote: 'Vous pouvez approuver ou refuser cette demande depuis le tableau de bord.',
  },
  it: {
    eyebrow: 'Edizione accademica',
    greeting: 'Ciao',
    fallback: 'Se il pulsante non funziona, copia questo indirizzo nel tuo browser:',
    footer: "DolyNation Editoriale · Supporto accademico · Termini d'uso · Privacy",
    approvedSubSubject: 'La tua richiesta è stata approvata — DolyNation',
    approvedSubHeadline: 'Congratulazioni, richiesta approvata',
    approvedSubBody: (plan) =>
      `la tua richiesta per il piano ${plan} è stata approvata dal team di DolyNation. Ora puoi configurare le tue preferenze e iniziare a generare letture.`,
    approvedSubCta: 'Vai su DolyNation',
    approvedSubNote: 'Grazie per provare DolyNation insieme a noi.',
    approvedLangSubject: 'Cambio lingua sbloccato — DolyNation',
    approvedLangHeadline: 'Il tuo sblocco lingua è stato approvato',
    approvedLangBody:
      'abbiamo approvato la tua richiesta di sblocco lingua. Ora hai 1 credito disponibile nel tuo profilo per cambiare lingua di studio.',
    approvedLangCta: 'Configura lingue',
    approvedLangNote: 'Visita il tuo profilo per applicare la modifica.',
    rejectedSubject: 'Aggiornamento sulla tua richiesta — DolyNation',
    rejectedHeadline: 'La tua richiesta non è stata approvata',
    rejectedSubBody: (plan) =>
      `abbiamo esaminato la tua richiesta per il piano ${plan}, ma al momento non possiamo approvarla.`,
    rejectedLangBody:
      'abbiamo esaminato la tua richiesta di sblocco lingua, ma al momento non possiamo approvarla.',
    rejectedReasonLabel: "Motivo indicato dall'amministratore",
    rejectedCta: 'Torna su DolyNation',
    rejectedNote: 'Puoi inviare una nuova richiesta dal tuo account quando desideri.',
    adminNoticeSubject: (email) => `Nuova richiesta di accesso (${email}) — DolyNation`,
    adminNoticeHeadline: 'Nuova richiesta in attesa di revisione',
    adminNoticeSubBody: (requester, plan) =>
      `l'utente ${requester} ha richiesto l'accesso al piano ${plan}.`,
    adminNoticeLangBody: (requester) =>
      `l'utente ${requester} ha richiesto lo sblocco del cambio lingua.`,
    adminNoticeMessageLabel: "Messaggio dell'utente",
    adminNoticeNoMessage: 'Nessun messaggio aggiuntivo.',
    adminNoticeCta: 'Esamina nel pannello admin',
    adminNoticeNote: 'Puoi approvare o rifiutare questa richiesta dalla dashboard admin.',
  },
};

/**
 * Renderiza el correo cuando una solicitud de plan o desbloqueo de idioma fue aprobada.
 */
export function renderAccessRequestApproved(
  locale: MailLocale,
  input: AccessRequestApprovedInput,
): RenderedMail {
  const s = REQUEST_STRINGS[locale];
  const isSubscription = input.requestType === 'subscription';
  const planLabel = input.planName ?? 'Dolly';
  const copy: TemplateCopy = {
    subject: isSubscription ? s.approvedSubSubject : s.approvedLangSubject,
    eyebrow: s.eyebrow,
    headline: isSubscription ? s.approvedSubHeadline : s.approvedLangHeadline,
    greeting: s.greeting,
    body: isSubscription ? s.approvedSubBody(planLabel) : s.approvedLangBody,
    cta: isSubscription ? s.approvedSubCta : s.approvedLangCta,
    fallback: s.fallback,
    note: isSubscription ? s.approvedSubNote : s.approvedLangNote,
    footer: s.footer,
  };
  const greeting = buildGreeting(copy, input.fullName);
  return {
    subject: copy.subject,
    html: renderHtml({ locale, copy, greeting, url: input.actionUrl }),
    text: renderText(copy, greeting, input.actionUrl),
  };
}

/**
 * Renderiza el correo cuando una solicitud fue rechazada, incluyendo el motivo del administrador.
 */
export function renderAccessRequestRejected(
  locale: MailLocale,
  input: AccessRequestRejectedInput,
): RenderedMail {
  const s = REQUEST_STRINGS[locale];
  const isSubscription = input.requestType === 'subscription';
  const planLabel = input.planName ?? 'Dolly';
  const copy: TemplateCopy = {
    subject: s.rejectedSubject,
    eyebrow: s.eyebrow,
    headline: s.rejectedHeadline,
    greeting: s.greeting,
    body: isSubscription ? s.rejectedSubBody(planLabel) : s.rejectedLangBody,
    cta: s.rejectedCta,
    fallback: s.fallback,
    note: s.rejectedNote,
    footer: s.footer,
  };
  const greeting = buildGreeting(copy, input.fullName);
  return {
    subject: copy.subject,
    html: renderHtml({
      locale,
      copy,
      greeting,
      url: input.actionUrl,
      calloutHtml: renderCalloutBox(s.rejectedReasonLabel, input.reason),
    }),
    text: renderText(copy, greeting, input.actionUrl, [`${s.rejectedReasonLabel}:`, input.reason]),
  };
}

/**
 * Renderiza el aviso opcional para el administrador cuando entra una nueva solicitud.
 */
export function renderAdminAccessRequestNotice(
  locale: MailLocale,
  input: AdminAccessRequestNoticeInput,
): RenderedMail {
  const s = REQUEST_STRINGS[locale];
  const requesterLabel = input.requesterName?.trim()
    ? `${input.requesterName.trim()} (${input.requesterEmail})`
    : input.requesterEmail;
  const isSubscription = input.requestType === 'subscription';
  const planLabel = input.planName ?? 'Dolly';
  const copy: TemplateCopy = {
    subject: s.adminNoticeSubject(input.requesterEmail),
    eyebrow: s.eyebrow,
    headline: s.adminNoticeHeadline,
    greeting: s.greeting,
    body: isSubscription
      ? s.adminNoticeSubBody(requesterLabel, planLabel)
      : s.adminNoticeLangBody(requesterLabel),
    cta: s.adminNoticeCta,
    fallback: s.fallback,
    note: s.adminNoticeNote,
    footer: s.footer,
  };
  const greeting = buildGreeting(copy, null);
  const trimmedMessage = input.userMessage?.trim() ?? '';
  const messageText = trimmedMessage.length > 0 ? trimmedMessage : s.adminNoticeNoMessage;
  return {
    subject: copy.subject,
    html: renderHtml({
      locale,
      copy,
      greeting,
      url: input.adminUrl,
      calloutHtml: renderCalloutBox(s.adminNoticeMessageLabel, messageText),
    }),
    text: renderText(copy, greeting, input.adminUrl, [
      `${s.adminNoticeMessageLabel}:`,
      messageText,
    ]),
  };
}
