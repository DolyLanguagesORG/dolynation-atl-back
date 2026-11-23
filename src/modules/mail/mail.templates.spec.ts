import {
  renderAccessRequestApproved,
  renderAccessRequestRejected,
  renderAccountConfirmation,
  renderAdminAccessRequestNotice,
  renderPasswordReset,
} from './mail.templates';
import { MAIL_LOCALES, isMailLocale } from './mail.types';

describe('Mail templates', () => {
  const confirmationUrl = 'https://devplay.dolynation.app/verify-email?token=abc123';
  const resetUrl = 'https://devplay.dolynation.app/reset-password?token=xyz789';

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

    it('renders the French copy when the locale is fr', () => {
      const mail = renderAccountConfirmation('fr', { fullName: 'Elena Rostova', confirmationUrl });

      expect(mail.subject).toBe('Confirmez votre DolyCompte — DolyNation');
      expect(mail.html).toContain('Confirmer mon compte');
      expect(mail.html).toContain('Édition académique');
      expect(mail.text).toContain(confirmationUrl);
    });

    it('renders the Italian copy when the locale is it', () => {
      const mail = renderAccountConfirmation('it', { fullName: 'Elena Rostova', confirmationUrl });

      expect(mail.subject).toBe('Conferma il tuo DolyAccount — DolyNation');
      expect(mail.html).toContain('Conferma il mio account');
      expect(mail.html).toContain('Edizione accademica');
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

    it('renders the French copy when the locale is fr', () => {
      const mail = renderPasswordReset('fr', { fullName: 'Elena Rostova', resetUrl });

      expect(mail.subject).toBe('Réinitialisez votre mot de passe — DolyNation');
      expect(mail.html).toContain('Réinitialiser le mot de passe');
      expect(mail.html).toContain(resetUrl);
    });

    it('renders the Italian copy when the locale is it', () => {
      const mail = renderPasswordReset('it', { fullName: 'Elena Rostova', resetUrl });

      expect(mail.subject).toBe('Reimposta la tua password — DolyNation');
      expect(mail.html).toContain('Reimposta password');
      expect(mail.html).toContain(resetUrl);
    });

    it('mentions that the link is single use and time limited', () => {
      const es = renderPasswordReset('es', { fullName: null, resetUrl });
      const en = renderPasswordReset('en', { fullName: null, resetUrl });
      const fr = renderPasswordReset('fr', { fullName: null, resetUrl });
      const it = renderPasswordReset('it', { fullName: null, resetUrl });

      expect(es.html).toContain('60 minutos');
      expect(en.html).toContain('60 minutes');
      expect(fr.html).toContain('60 minutes');
      expect(it.html).toContain('60 minuti');
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

  describe('access request email templates', () => {
    it('renders approval emails for subscription and language unlock across all locales', () => {
      for (const locale of MAIL_LOCALES) {
        const subMail = renderAccessRequestApproved(locale, {
          fullName: 'Sofía Morales',
          requestType: 'subscription',
          planName: 'Dolly Plus',
          actionUrl: 'https://devplay.dolynation.app/setup-preferences',
        });
        expect(subMail.html).toContain('Dolly Plus');
        expect(subMail.text).toContain('Dolly Plus');
        expect(subMail.html).not.toContain('undefined');

        const langMail = renderAccessRequestApproved(locale, {
          fullName: 'Sofía Morales',
          requestType: 'language_unlock',
          planName: null,
          actionUrl: 'https://devplay.dolynation.app/profile',
        });
        expect(langMail.html).toContain('https://devplay.dolynation.app/profile');
        expect(langMail.text).toContain('https://devplay.dolynation.app/profile');
      }
    });

    it('renders rejection email including escaped rejection reason', () => {
      const mail = renderAccessRequestRejected('es', {
        fullName: 'Sofía Morales',
        requestType: 'subscription',
        planName: 'Dolly Pro',
        reason: 'Cupo <temporal> agotado para esta semana',
        actionUrl: 'https://devplay.dolynation.app/select-plan',
      });

      expect(mail.html).toContain('Cupo &lt;temporal&gt; agotado para esta semana');
      expect(mail.html).toContain('Motivo indicado por el administrador');
      expect(mail.text).toContain('Cupo <temporal> agotado para esta semana');
    });

    it('renders admin notification email with requester details and escaped message', () => {
      const mail = renderAdminAccessRequestNotice('es', {
        requesterName: 'Ana',
        requesterEmail: 'ana@example.com',
        requestType: 'subscription',
        planName: 'Dolly Plus',
        userMessage: 'Quiero practicar francés <todos los días>',
        adminUrl: 'https://devplay.dolynation.app/admin',
      });

      expect(mail.subject).toContain('ana@example.com');
      expect(mail.html).toContain('Quiero practicar francés &lt;todos los días&gt;');
      expect(mail.text).toContain('ana@example.com');
    });
  });
});

describe('isMailLocale', () => {
  it('accepts the supported locales and rejects anything else', () => {
    expect(isMailLocale('es')).toBe(true);
    expect(isMailLocale('en')).toBe(true);
    expect(isMailLocale('fr')).toBe(true);
    expect(isMailLocale('it')).toBe(true);
    expect(isMailLocale('de')).toBe(false);
    expect(isMailLocale(undefined)).toBe(false);
    expect(isMailLocale('')).toBe(false);
  });
});
