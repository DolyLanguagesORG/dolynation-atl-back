import { VersionController } from './version.controller';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

describe('VersionController', () => {
  let controller: VersionController;

  beforeEach(() => {
    controller = new VersionController();
  });

  it('devuelve la version del build en el envelope', () => {
    const result = controller.version();

    expect(result.message).toBe('Version');
    expect(result.data).toMatchObject({
      appVersion: expect.any(String),
      component: expect.any(String),
      version: expect.any(String),
      commit: expect.any(String),
      builtAt: expect.any(String),
    });
  });

  it('el campo data lleva los 5 campos de la version', () => {
    const { data } = controller.version();

    expect(Object.keys(data).sort()).toEqual([
      'appVersion',
      'builtAt',
      'commit',
      'component',
      'version',
    ]);
  });

  it('es publico: el guard global de auth lo deja pasar', () => {
    // El endpoint tiene que responder aunque la base este caida, porque su
    // funcion es auditar. El guard lee IS_PUBLIC_KEY sobre el handler, asi
    // que el metodo tiene que llevar el metadata de @Public().
    //
    // Se lee con Reflect.getMetadata y no con Reflector: el Reflector
    // espera el handler sin ligar, y un .bind() crearia una funcion nueva
    // que perderia el metadata.
    // Se lee del descriptor del prototype y no de `prototype.version`:
    // referenciar el metodo suelto dispara unbound-method, porque no se
    // esta llamando sino leyendo su metadata.
    const descriptor = Object.getOwnPropertyDescriptor(VersionController.prototype, 'version');
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, descriptor?.value);

    expect(isPublic).toBe(true);
  });
});
