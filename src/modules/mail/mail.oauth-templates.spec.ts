import { renderOAuthAccountLinked, renderOAuthOnlyPasswordAttempt } from './mail.templates';
import { MAIL_LOCALES } from './mail.types';

describe('Mail templates de OAuth (back#188)', () => {
  const loginUrl = 'https://devplay.dolynation.app/login';
  const forgotUrl = 'https://devplay.dolynation.app/forgot-password';

  it('renderOAuthAccountLinked avisa en español que se vinculó el proveedor', () => {
    const mail = renderOAuthAccountLinked('es', {
      fullName: 'Elena Rostova',
      providerName: 'Google',
      passwordRemoved: false,
      actionUrl: loginUrl,
    });

    expect(mail.subject).toBe('Vinculamos tu DolyCuenta con Google — DolyNation');
    expect(mail.html).toContain('Elena Rostova');
    expect(mail.html).toContain('con Google o con tu contraseña');
    expect(mail.html).toContain(loginUrl);
    expect(mail.text).toContain(loginUrl);
  });

  it('renderOAuthAccountLinked explica que se quitó la contraseña y enlaza a crear otra', () => {
    const mail = renderOAuthAccountLinked('es', {
      fullName: null,
      providerName: 'Google',
      passwordRemoved: true,
      actionUrl: forgotUrl,
    });

    expect(mail.html).toContain('quitamos la contraseña que tenía');
    expect(mail.html).toContain('Crear una contraseña');
    expect(mail.text).toContain(forgotUrl);
  });

  it('renderOAuthOnlyPasswordAttempt explica que la cuenta usa el proveedor', () => {
    const mail = renderOAuthOnlyPasswordAttempt('es', {
      fullName: 'Elena',
      providerName: 'Microsoft',
      forgotPasswordUrl: forgotUrl,
    });

    expect(mail.subject).toBe('Intento de acceso con contraseña — DolyNation');
    expect(mail.html).toContain('Tu cuenta usa Microsoft');
    expect(mail.html).toContain(forgotUrl);
  });

  it.each(MAIL_LOCALES)('las dos plantillas renderizan completas en %s', (locale) => {
    const variants = [
      renderOAuthAccountLinked(locale, {
        fullName: 'Ada',
        providerName: 'Google',
        passwordRemoved: false,
        actionUrl: loginUrl,
      }),
      renderOAuthAccountLinked(locale, {
        fullName: 'Ada',
        providerName: 'Google',
        passwordRemoved: true,
        actionUrl: forgotUrl,
      }),
      renderOAuthOnlyPasswordAttempt(locale, {
        fullName: 'Ada',
        providerName: 'Google',
        forgotPasswordUrl: forgotUrl,
      }),
    ];

    for (const mail of variants) {
      expect(mail.subject.length).toBeGreaterThan(0);
      expect(mail.html).toContain('Google');
      expect(mail.html).toContain(`lang="${locale}"`);
      expect(mail.text).not.toContain('undefined');
      expect(mail.html).not.toContain('undefined');
    }
  });

  it('escapa el nombre del usuario en el HTML', () => {
    const mail = renderOAuthAccountLinked('en', {
      fullName: '<script>x</script>',
      providerName: 'Google',
      passwordRemoved: false,
      actionUrl: loginUrl,
    });
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
