import { appVersion } from './version';

describe('appVersion', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('lee la versión del package.json del proyecto', () => {
    delete process.env.APP_VERSION;
    delete process.env.GIT_COMMIT;

    const { version } = appVersion();

    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('permite sobrescribir la versión y el commit por entorno', () => {
    process.env.APP_VERSION = '9.9.9';
    process.env.GIT_COMMIT = 'abc1234';

    expect(appVersion()).toEqual({ version: '9.9.9', commit: 'abc1234' });
  });

  it('devuelve un commit desconocido si no se inyecta', () => {
    delete process.env.APP_VERSION;
    delete process.env.GIT_COMMIT;

    expect(appVersion().commit).toBe('unknown');
  });
});
