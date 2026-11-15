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

  describe('variables que llegan vacias de GitHub', () => {
    // Una variable o secret de GitHub que no existe se resuelve a "" en el
    // `.env` del servidor. Sin `emptyToUndefined` eso rompe el enum del
    // arranque o manda un valor invalido al API.
    it('MINIMAX_* caen al default en vez de quedar vacias', () => {
      const env = validateEnv({
        ...base,
        MINIMAX_MODEL: '',
        MINIMAX_ENDPOINT: '',
        MINIMAX_REASONING_EFFORT: '',
        MINIMAX_API_KEY: '',
        GROQ_MODEL: '',
      });

      expect(env.MINIMAX_MODEL).toBe('MiniMax-M2.7');
      expect(env.MINIMAX_ENDPOINT).toBe('https://api.minimax.io/v1/chat/completions');
      expect(env.MINIMAX_REASONING_EFFORT).toBe('low');
      expect(env.MINIMAX_API_KEY).toBeUndefined();
      expect(env.GROQ_MODEL).toBe('qwen/qwen3-32b');
    });

    it('el .env completo del deploy de desarrollo es valido', () => {
      // Lo que el workflow `deploy-dev.yml` escribe en el servidor.
      const env = validateEnv({
        NODE_ENV: 'development',
        PORT: '3333',
        HOST: '0.0.0.0',
        API_PREFIX: 'api/v1',
        APP_NAME: 'dolynglish-backend',
        LOG_LEVEL: 'debug',
        DB_HOST: 'doly-dev-db',
        DB_PORT: '5432',
        DB_USER: 'dolynglish_user',
        DB_PASSWORD: 'x',
        DB_DATABASE: 'dolynglish_test',
        DB_LOGGING: 'false',
        JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
        JWT_ACCESS_TTL: '5m',
        JWT_REFRESH_TTL: '30d',
        AI_DEFAULT_PROVIDER: 'minimax',
        MINIMAX_API_KEY: 'k',
        MINIMAX_MODEL: '',
        MINIMAX_REASONING_EFFORT: 'low',
        GROQ_API_KEY: '',
        GOOGLE_API_KEY: 'k',
        GOOGLE_MODEL: 'gemini-3.5-flash-lite',
        OPENAI_API_KEY: 'k',
        OPENAI_MODERATION_ENDPOINT: 'https://api.openai.com/v1/moderations',
        OPENAI_MODERATION_MODEL: 'omni-moderation-latest',
        CATEGORY_MODERATION_ENABLED: 'true',
        CATEGORY_MODERATION_AI_ENABLED: 'true',
        CATEGORY_MODERATION_AI_PROVIDER: 'auto',
        CATEGORY_DAILY_LIMIT: '20',
        CATEGORY_MODERATION_SCORE_THRESHOLD: '0.45',
        CATEGORY_MODERATION_TIMEOUT_MS: '15000',
        CATEGORY_MODERATION_CACHE_TTL_MS: '86400000',
        SMTP_HOST: 'smtp-relay.brevo.com',
        SMTP_PORT: '587',
        SMTP_USER: 'u',
        SMTP_PASSWORD: 'p',
        SMTP_FROM: 'f',
        SMTP_FROM_NAME: 'D',
        SMTP_SECURE: 'false',
        FRONTEND_BASE_URL: 'https://devweb.yacaterkos.tech',
        EMAIL_VERIFICATION_REQUIRED: 'false',
      });

      expect(env.FRONTEND_BASE_URL).toBe('https://devweb.yacaterkos.tech');
      expect(env.EMAIL_VERIFICATION_REQUIRED).toBe(false);
      expect(env.CATEGORY_MODERATION_AI_PROVIDER).toBe('auto');
      expect(env.GOOGLE_API_KEY).toBe('k');
      expect(env.OPENAI_API_KEY).toBe('k');
    });
  });
});
