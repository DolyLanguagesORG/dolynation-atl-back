import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appVersion, resetVersionCache } from './version';

describe('appVersion', () => {
  const original = { ...process.env };

  beforeEach(() => {
    // El cache de builtAt es correcto en produccion (un build tiene una
    // fecha), pero entre tests hay que limpiarlo para poder cambiar
    // BUILT_AT.
    resetVersionCache();
  });

  afterEach(() => {
    process.env = { ...original };
    resetVersionCache();
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

    expect(appVersion()).toMatchObject({ appVersion: '9.9.9', commit: 'abc1234' });
  });

  it('devuelve un commit desconocido si no se inyecta', () => {
    delete process.env.APP_VERSION;
    delete process.env.GIT_COMMIT;

    expect(appVersion().commit).toBe('unknown');
  });

  it('la versión que reporta es la misma que la del package.json', () => {
    // La raíz de la API y el documento OpenAPI usan appVersion(): si este
    // test falla, la raíz estaría mintiendo sobre la versión que corre.
    delete process.env.APP_VERSION;
    delete process.env.GIT_COMMIT;

    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(appVersion().version).toBe(pkg.version);
  });

  it('identifica el componente y la versión de la aplicación', () => {
    process.env.APP_VERSION = '1.2.3';
    process.env.COMPONENT = 'dolynation-atl-back';

    const { appVersion: app, component } = appVersion();

    expect(app).toBe('1.2.3');
    expect(component).toBe('dolynation-atl-back');
  });

  it('el componente por defecto es este repositorio', () => {
    delete process.env.COMPONENT;

    expect(appVersion().component).toBe('dolynation-atl-back');
  });

  it('sin APP_VERSION, la versión de la app es la del repositorio', () => {
    delete process.env.APP_VERSION;

    expect(appVersion().appVersion).toBe(appVersion().version);
  });

  it('builtAt es estable entre llamadas', () => {
    // Si cambiara entre peticiones, dos auditorías del mismo build darían
    // fechas distintas y no se podría comparar con el manifiesto.
    delete process.env.BUILT_AT;

    const first = appVersion().builtAt;
    const second = appVersion().builtAt;

    expect(second).toBe(first);
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('usa BUILT_AT cuando el build lo inyecta', () => {
    process.env.BUILT_AT = '2026-11-07T14:42:25.000Z';

    expect(appVersion().builtAt).toBe('2026-11-07T14:42:25.000Z');
  });
});
