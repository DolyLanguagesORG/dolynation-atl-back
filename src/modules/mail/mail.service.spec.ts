import { Test } from '@nestjs/testing';
import { AppConfigService } from '../../config/env.config';
import { MailConfigurationError, MailDeliveryError, describeError } from './mail.errors';
import { MailService, buildSmtpOptions, formatFrom, maskEmail } from './mail.service';
import type { MailMessage } from './mail.types';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const nodemailer = require('nodemailer') as { createTransport: jest.Mock };

const baseMailConfig = {
  host: 'smtp-relay.brevo.com',
  port: 587,
  user: 'login@brevo.example',
  password: 'super-secret-key',
  from: 'no-reply@dolynation.example',
  fromName: 'DolyNation Editorial',
  secure: false,
  frontendBaseUrl: 'https://devweb.yacaterkos.tech',
  verificationRequired: false,
};

describe('MailService', () => {
  let service: MailService;
  let sendMail: jest.Mock;
  let verify: jest.Mock;

  const buildService = async (overrides: Partial<typeof baseMailConfig> = {}) => {
    const mailConfig = { ...baseMailConfig, ...overrides };
    const moduleRef = await Test.createTestingModule({
      providers: [MailService, { provide: AppConfigService, useValue: { mail: mailConfig } }],
    }).compile();
    return moduleRef.get(MailService);
  };

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    verify = jest.fn().mockResolvedValue(true);
    nodemailer.createTransport.mockReset();
    nodemailer.createTransport.mockReturnValue({ sendMail, verify });
  });

  describe('buildSmtpOptions', () => {
    it('maps the environment variables to the transport options', () => {
      const options = buildSmtpOptions(baseMailConfig);

      expect(options.host).toBe('smtp-relay.brevo.com');
      expect(options.port).toBe(587);
      expect(options.secure).toBe(false);
      expect(options.auth).toEqual({
        user: 'login@brevo.example',
        pass: 'super-secret-key',
      });
    });

    it('requires STARTTLS whenever TLS is not implicit', () => {
      expect(buildSmtpOptions(baseMailConfig).requireTLS).toBe(true);
      expect(buildSmtpOptions({ ...baseMailConfig, port: 465, secure: true }).requireTLS).toBe(
        false,
      );
    });

    it('omits the credentials when no user is configured (local catchers)', () => {
      const options = buildSmtpOptions({
        ...baseMailConfig,
        user: '',
        password: '',
      });

      expect(options.auth).toBeUndefined();
    });

    it('fails with a clear message when SMTP_HOST is missing', () => {
      expect(() => buildSmtpOptions({ ...baseMailConfig, host: '' })).toThrow(
        MailConfigurationError,
      );
      expect(() => buildSmtpOptions({ ...baseMailConfig, host: '' })).toThrow(/SMTP_HOST/);
    });

    it('fails with a clear message when SMTP_FROM is missing', () => {
      expect(() => buildSmtpOptions({ ...baseMailConfig, from: '' })).toThrow(/SMTP_FROM/);
    });

    it('fails with a clear message when the password is missing but the user is set', () => {
      expect(() => buildSmtpOptions({ ...baseMailConfig, password: '' })).toThrow(/SMTP_PASSWORD/);
    });
  });

  describe('formatFrom', () => {
    it('combines the name and the address', () => {
      expect(formatFrom('no-reply@x.com', 'DolyNation Editorial')).toBe(
        '"DolyNation Editorial" <no-reply@x.com>',
      );
    });

    it('falls back to the bare address when there is no name', () => {
      expect(formatFrom('no-reply@x.com', '')).toBe('no-reply@x.com');
    });
  });

  describe('maskEmail', () => {
    it('keeps the domain but hides the local part', () => {
      expect(maskEmail('elena@ejemplo.com')).toBe('e****@ejemplo.com');
    });

    it('never returns the full local part', () => {
      expect(maskEmail('a@b.com')).not.toContain('a@');
    });
  });

  describe('describeError', () => {
    it('never exposes the raw provider message, only the error code', () => {
      const error = Object.assign(new Error('535 auth failed for super-secret-key'), {
        code: 'EAUTH',
      });

      const description = describeError(error);

      expect(description).toBe('Error (EAUTH)');
      expect(description).not.toContain('super-secret-key');
    });

    it('falls back to the error name when there is no code', () => {
      expect(describeError(new Error('boom'))).toBe('Error');
      expect(describeError('boom')).toBe('error desconocido');
    });
  });

  describe('send', () => {
    it('sends the message through the configured transport', async () => {
      service = await buildService();
      const message: MailMessage = {
        to: 'elena@ejemplo.com',
        subject: 'Hola',
        html: '<p>Hola</p>',
        text: 'Hola',
      };

      await service.send(message);

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"DolyNation Editorial" <no-reply@dolynation.example>',
          to: 'elena@ejemplo.com',
          subject: 'Hola',
          html: '<p>Hola</p>',
          text: 'Hola',
        }),
      );
    });

    it('throws a generic MailDeliveryError that never leaks the provider error', async () => {
      sendMail.mockRejectedValue(
        new Error('535 auth failed for user super-secret-key at smtp-relay.brevo.com'),
      );
      service = await buildService();

      await expect(
        service.send({ to: 'elena@ejemplo.com', subject: 'x', html: 'x', text: 'x' }),
      ).rejects.toBeInstanceOf(MailDeliveryError);

      const error = await service
        .send({ to: 'elena@ejemplo.com', subject: 'x', html: 'x', text: 'x' })
        .then(
          () => null,
          (caught: unknown) => caught as Error,
        );

      expect(error).toBeInstanceOf(MailDeliveryError);
      expect(error?.message).toBe('Failed to send email');
      expect(error?.message).not.toContain('super-secret-key');
      expect(error?.message).not.toContain('smtp-relay.brevo.com');
    });

    it('does not create the transport until the first send', async () => {
      service = await buildService();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();

      await service.send({ to: 'elena@ejemplo.com', subject: 'x', html: 'x', text: 'x' });

      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendAccountConfirmation', () => {
    it('builds the verification link from the frontend base url', async () => {
      service = await buildService();

      await service.sendAccountConfirmation({
        to: 'elena@ejemplo.com',
        fullName: 'Elena Rostova',
        token: 'tok-123',
        locale: 'es',
      });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'elena@ejemplo.com',
          subject: 'Confirma tu DolyCuenta — DolyNation',
        }),
      );
      const payload = sendMail.mock.calls[0]?.[0] as { html: string; text: string };
      expect(payload.html).toContain('https://devweb.yacaterkos.tech/verify-email?token=tok-123');
      expect(payload.text).toContain('tok-123');
    });
  });

  describe('sendPasswordReset', () => {
    it('builds the reset link from the frontend base url', async () => {
      service = await buildService();

      await service.sendPasswordReset({
        to: 'elena@ejemplo.com',
        fullName: 'Elena Rostova',
        token: 'tok-456',
        locale: 'en',
      });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Reset your password — DolyNation',
        }),
      );
      const payload = sendMail.mock.calls[0]?.[0] as { html: string };
      expect(payload.html).toContain('https://devweb.yacaterkos.tech/reset-password?token=tok-456');
    });
  });
});
