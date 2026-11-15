import { renderAccountConfirmation, renderPasswordReset } from './mail.templates';
import { MAIL_LOCALES, isMailLocale } from './mail.types';

describe('Mail templates', () => {
  const confirmationUrl = 'https://devweb.yacaterkos.tech/verify-email?token=abc123';
  const resetUrl = 'https://devweb.yacaterkos.tech/reset-password?token=xyz789';

  describe('renderAccountConfirmation', () => {
    it('renders the Spanish copy with the CTA, the link and a plain text version', () => {
      const mail = renderAccountConfirmation('es', { fullName: 'Elena Rostova', confirmationUrl });

      expect(mail.subject).toBe('Confirma tu DolyCuenta — DolyNation');
      expect(mail.html).toContain('Confirmar mi cuenta');
      expect(mail.html).toContain('Elena Rostova');
      expect(mail.html).toContain(confirmationUrl);
      expect(mail.text).toContain('Confirmar mi cuenta'.toUpperCase());
      expect(mail.text).toContain(confirmationUrl);
    });

    it('renders the English copy when the locale is en', () => {
      const mail = renderAccountConfirmation('en', { fullName: 'Elena Rostova', confirmationUrl });

      expect(mail.subject).toBe('Confirm your DolyAccount — DolyNation');
      expect(mail.html).toContain('Confirm my account');
      expect(mail.html).toContain('Academic edition');
      expect(mail.text).toContain(confirmationUrl);
    });

    it('greets without a name when the account has no full name', () => {
      const mail = renderAccountConfirmation('es', { fullName: null, confirmationUrl });

      expect(mail.html).toContain('Hola,');
      expect(mail.html).not.toContain('undefined');
    });

    it('escapes HTML in the user supplied full name', () => {
      const mail = renderAccountConfirmation('en', {
        fullName: '<script>alert(1)</script>',
        confirmationUrl,
      });

      expect(mail.html).not.toContain('<script>');
      expect(mail.html).toContain('&lt;script&gt;');
    });

    it('never leaves an unresolved placeholder in the output', () => {
      for (const locale of MAIL_LOCALES) {
        const mail = renderAccountConfirmation(locale, { fullName: 'A B', confirmationUrl });
        expect(mail.html).not.toContain('undefined');
        expect(mail.html).not.toContain('{{');
        expect(mail.html).not.toContain('}}');
        expect(mail.text).not.toContain('undefined');
      }
    });
  });

  describe('renderPasswordReset', () => {
    it('renders the Spanish copy with the reset link', () => {
      const mail = renderPasswordReset('es', { fullName: 'Elena Rostova', resetUrl });

      expect(mail.subject).toBe('Restablece tu contraseña — DolyNation');
      expect(mail.html).toContain('Restablecer contraseña');
      expect(mail.html).toContain(resetUrl);
      expect(mail.text).toContain(resetUrl);
    });

    it('renders the English copy when the locale is en', () => {
      const mail = renderPasswordReset('en', { fullName: 'Elena Rostova', resetUrl });

      expect(mail.subject).toBe('Reset your password — DolyNation');
      expect(mail.html).toContain('Reset password');
      expect(mail.html).toContain(resetUrl);
    });

    it('mentions that the link is single use and time limited', () => {
      const es = renderPasswordReset('es', { fullName: null, resetUrl });
      const en = renderPasswordReset('en', { fullName: null, resetUrl });

      expect(es.html).toContain('60 minutos');
      expect(en.html).toContain('60 minutes');
    });
  });

  it('uses the monochrome editorial palette of the frontend design system', () => {
    const mail = renderAccountConfirmation('es', { fullName: 'A B', confirmationUrl });

    expect(mail.html).toContain('#fafafa');
    expect(mail.html).toContain('#ffffff');
    expect(mail.html).toContain('#0a0a0a');
    expect(mail.html).toContain('#525252');
    expect(mail.html).toContain('#737373');
    expect(mail.html).toContain('#e5e5e5');
  });
});

describe('isMailLocale', () => {
  it('accepts the supported locales and rejects anything else', () => {
    expect(isMailLocale('es')).toBe(true);
    expect(isMailLocale('en')).toBe(true);
    expect(isMailLocale('fr')).toBe(false);
    expect(isMailLocale('it')).toBe(false);
    expect(isMailLocale(undefined)).toBe(false);
    expect(isMailLocale('')).toBe(false);
  });
});
