import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../../config/env.config';
import { MailConfigurationError, MailDeliveryError, describeError } from './mail.errors';
import { renderAccountConfirmation, renderPasswordReset } from './mail.templates';
import {
  FRONTEND_RESET_PASSWORD_PATH,
  FRONTEND_VERIFY_EMAIL_PATH,
  buildFrontendUrl,
} from './mail.constants';
import type { MailLocale, MailMessage, MailTransport } from './mail.types';

/** Tiempo máximo de espera en cada fase de la conexión SMTP (ms). */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Opciones de conexión SMTP derivadas de la configuración por entorno.
 *
 * Se exponen como un tipo propio (y no como el de nodemailer) para poder
 * verificarlas en las pruebas sin abrir una conexión real.
 */
export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/**
 * Construye las opciones de transporte SMTP a partir de la configuración.
 *
 * @throws {MailConfigurationError} si falta una variable imprescindible.
 */
export function buildSmtpOptions(mail: AppConfigService['mail']): SmtpTransportOptions {
  const host = mail.host?.trim() ?? '';
  if (host.length === 0) {
    throw new MailConfigurationError('SMTP is not configured: missing SMTP_HOST');
  }

  const from = mail.from?.trim() ?? '';
  if (from.length === 0) {
    throw new MailConfigurationError('SMTP is not configured: missing SMTP_FROM');
  }

  const user = mail.user?.trim() ?? '';
  const password = mail.password?.trim() ?? '';
  if (user.length > 0 && password.length === 0) {
    throw new MailConfigurationError('SMTP is not configured: missing SMTP_PASSWORD');
  }

  const secure = mail.secure;
  const options: SmtpTransportOptions = {
    host,
    port: mail.port,
    secure,
    // Con TLS implícito (465) `secure` ya cubre el cifrado. En cualquier otro
    // puerto se exige STARTTLS para que las credenciales nunca viajen en claro.
    requireTLS: !secure,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };

  if (user.length > 0 && password.length > 0) {
    options.auth = { user, pass: password };
  }

  return options;
}

/** Compone la cabecera `From` con el nombre y la dirección configurados. */
export function formatFrom(from: string | undefined, fromName: string | undefined): string {
  const address = from?.trim() ?? '';
  const name = fromName?.trim() ?? '';
  return name.length > 0 ? `"${name.replace(/"/g, '')}" <${address}>` : address;
}

/**
 * Enmascara el correo del destinatario para poder registrarlo sin exponer PII
 * completa en los logs.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) {
    return '***';
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
}

/** Transporte SMTP real, respaldado por nodemailer. */
class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(
    options: SmtpTransportOptions,
    private readonly from: string,
  ) {
    this.transporter = createTransport(options);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}

/**
 * Servicio global de correo transaccional.
 *
 * Es la única pieza que habla con el proveedor SMTP. El resto de la aplicación
 * (flujos de confirmación de cuenta y de restablecimiento de contraseña) solo
 * conoce esta API, de modo que añadir un nuevo tipo de correo es una función
 * nueva aquí y una plantilla nueva, sin tocar los flujos.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: MailTransport | null = null;

  constructor(private readonly config: AppConfigService) {}

  /**
   * Devuelve el transporte, creándolo en el primer uso.
   *
   * Es deliberadamente perezoso: si faltan credenciales la aplicación **arranca
   * igual** y el fallo ocurre al intentar enviar, que es cuando el mensaje de
   * error ayuda de verdad.
   */
  private getTransport(): MailTransport {
    if (!this.transport) {
      const mail = this.config.mail;
      this.transport = new SmtpMailTransport(
        buildSmtpOptions(mail),
        formatFrom(mail.from, mail.fromName),
      );
    }
    return this.transport;
  }

  /**
   * Envía un mensaje ya compuesto.
   *
   * @throws {MailDeliveryError} si el proveedor rechaza el envío.
   */
  async send(message: MailMessage): Promise<void> {
    try {
      await this.getTransport().send(message);
      this.logger.log(`Correo enviado a ${maskEmail(message.to)}`);
    } catch (error) {
      // Solo se registra el tipo y el código del error (`EAUTH`, `ECONNECTION`…):
      // el mensaje crudo del proveedor podría incluir datos sensibles y nunca
      // debe acabar en un log. Al cliente solo llega un código estable.
      this.logger.error(
        `No se pudo enviar el correo a ${maskEmail(message.to)}: ${describeError(error)}`,
      );
      throw new MailDeliveryError();
    }
  }

  /**
   * Envía el correo de confirmación de cuenta con el enlace de verificación.
   */
  async sendAccountConfirmation(input: {
    to: string;
    fullName: string | null;
    token: string;
    locale: MailLocale;
  }): Promise<void> {
    const confirmationUrl = buildFrontendUrl(
      this.config.mail.frontendBaseUrl,
      FRONTEND_VERIFY_EMAIL_PATH,
      {
        token: input.token,
      },
    );
    const rendered = renderAccountConfirmation(input.locale, {
      fullName: input.fullName,
      confirmationUrl,
    });
    await this.send({ to: input.to, ...rendered });
  }

  /**
   * Envía el correo de restablecimiento de contraseña con el enlace de reset.
   */
  async sendPasswordReset(input: {
    to: string;
    fullName: string | null;
    token: string;
    locale: MailLocale;
  }): Promise<void> {
    const resetUrl = buildFrontendUrl(
      this.config.mail.frontendBaseUrl,
      FRONTEND_RESET_PASSWORD_PATH,
      {
        token: input.token,
      },
    );
    const rendered = renderPasswordReset(input.locale, {
      fullName: input.fullName,
      resetUrl,
    });
    await this.send({ to: input.to, ...rendered });
  }
}
