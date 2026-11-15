import { validateEnv } from './env.validation';

/**
 * El schema Zod es la primera linea de defensa: si falta una variable que la
 * app necesita, el arranque aborta con el nombre exacto de lo que falta, en
 * vez de fallar mas tarde en cada peticion.
 */
describe('validateEnv', () => {
  const base = {
    NODE_ENV: 'test',
    DB_HOST: 'localhost',
    JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
  };

  describe('GOOGLE_API_KEY', () => {
    it('acepta el provider por defecto (minimax) sin GOOGLE_API_KEY', () => {
      const env = validateEnv(base);

      expect(env.AI_DEFAULT_PROVIDER).toBe('minimax');
      expect(env.GOOGLE_API_KEY).toBeUndefined();
    });

    it('acepta GOOGLE_API_KEY vacia como "no configurada" con provider minimax', () => {
      const env = validateEnv({ ...base, GOOGLE_API_KEY: '' });

      expect(env.GOOGLE_API_KEY).toBeUndefined();
    });

    it('rechaza el provider google sin GOOGLE_API_KEY', () => {
      expect(() => validateEnv({ ...base, AI_DEFAULT_PROVIDER: 'google' })).toThrow(
        /GOOGLE_API_KEY/,
      );
    });

    it('rechaza el provider google con GOOGLE_API_KEY vacia', () => {
      expect(() =>
        validateEnv({ ...base, AI_DEFAULT_PROVIDER: 'google', GOOGLE_API_KEY: '' }),
      ).toThrow(/GOOGLE_API_KEY/);
    });

    it('acepta el provider google con GOOGLE_API_KEY', () => {
      const env = validateEnv({
        ...base,
        AI_DEFAULT_PROVIDER: 'google',
        GOOGLE_API_KEY: 'test-key',
      });

      expect(env.GOOGLE_API_KEY).toBe('test-key');
    });
  });

  describe('EMAIL_VERIFICATION_REQUIRED', () => {
    it('lo interpreta como booleano y por defecto viene desactivado', () => {
      expect(validateEnv(base).EMAIL_VERIFICATION_REQUIRED).toBe(false);
      expect(
        validateEnv({ ...base, EMAIL_VERIFICATION_REQUIRED: 'true' }).EMAIL_VERIFICATION_REQUIRED,
      ).toBe(true);
      expect(
        validateEnv({ ...base, EMAIL_VERIFICATION_REQUIRED: '1' }).EMAIL_VERIFICATION_REQUIRED,
      ).toBe(true);
    });
  });

  describe('JWT_ACCESS_TTL', () => {
    it('usa 5m por defecto (el valor de todos los ambientes)', () => {
      expect(validateEnv(base).JWT_ACCESS_TTL).toBe('5m');
    });

    it('una variable de GitHub inexistente (cadena vacia) cae al default', () => {
      // Una variable de environment que no existe se resuelve a "" en GitHub.
      // Sin el preprocess, el TTL quedaria vacio y los tokens no expirarian.
      expect(validateEnv({ ...base, JWT_ACCESS_TTL: '' }).JWT_ACCESS_TTL).toBe('5m');
      expect(validateEnv({ ...base, JWT_REFRESH_TTL: '' }).JWT_REFRESH_TTL).toBe('30d');
    });
  });

  describe('AI_DEFAULT_PROVIDER', () => {
    it('cae al default si llega vacio', () => {
      expect(validateEnv({ ...base, AI_DEFAULT_PROVIDER: '' }).AI_DEFAULT_PROVIDER).toBe('minimax');
    });

    it('rechaza un provider que no existe', () => {
      expect(() => validateEnv({ ...base, AI_DEFAULT_PROVIDER: 'openai' })).toThrow();
    });
  });
});
