import type { AppConfigService } from '../../../config/env.config';
import { AIProviderFactory } from './ai-provider.factory';
import type { GoogleProvider } from './google.provider';
import type { MiniMaxProvider } from './MiniMax-M3.provider';

describe('AIProviderFactory', () => {
  const buildFactory = (defaultProvider: 'minimax' | 'google') => {
    const config = {
      ai: { defaultProvider },
    } as unknown as AppConfigService;
    const minimaxGetFullResponse = jest.fn().mockResolvedValue('minimax-ok');
    const minimaxStreamChat = jest.fn();
    const minimaxProvider = {
      info: { name: 'MiniMax-M3', model: 'MiniMax-M2.7' },
      getFullResponse: minimaxGetFullResponse,
      streamChat: minimaxStreamChat,
    } as unknown as MiniMaxProvider;
    const googleGetFullResponse = jest.fn().mockResolvedValue('google-ok');
    const googleStreamChat = jest.fn();
    const googleProvider = {
      info: { name: 'Google-Gemini', model: 'gemini-3.5-flash-lite' },
      getFullResponse: googleGetFullResponse,
      streamChat: googleStreamChat,
    } as unknown as GoogleProvider;

    return {
      factory: new AIProviderFactory(config, minimaxProvider, googleProvider),
      minimaxProvider,
      googleProvider,
      minimaxGetFullResponse,
      googleGetFullResponse,
      googleStreamChat,
    };
  };

  it('selecciona el proveedor configurado en AI_DEFAULT_PROVIDER cuando no se indica provider', async () => {
    const { factory, googleProvider, googleGetFullResponse, minimaxGetFullResponse } =
      buildFactory('google');

    expect(factory.resolveProviderName()).toBe('google');
    expect(factory.get()).toBe(googleProvider);

    const text = await factory.getFullResponse([{ role: 'user', content: 'Hola' }]);
    expect(text).toBe('google-ok');
    expect(googleGetFullResponse).toHaveBeenCalledTimes(1);
    expect(minimaxGetFullResponse).not.toHaveBeenCalled();
  });

  it('permite que los servicios consumidores elijan proveedor por llamada sin cambiar AI_DEFAULT_PROVIDER', async () => {
    const { factory, googleGetFullResponse, minimaxGetFullResponse, googleStreamChat } =
      buildFactory('minimax');

    expect(factory.resolveProviderName()).toBe('minimax');
    expect(factory.resolveProviderName('google')).toBe('google');

    const googleRes = await factory.getFullResponse([{ role: 'user', content: 'Hola' }], {
      provider: 'google',
      temperature: 0.4,
    });
    expect(googleRes).toBe('google-ok');
    expect(googleGetFullResponse).toHaveBeenCalledWith([{ role: 'user', content: 'Hola' }], {
      provider: 'google',
      temperature: 0.4,
    });
    expect(minimaxGetFullResponse).not.toHaveBeenCalled();

    factory.streamChat([{ role: 'user', content: 'Stream' }], { provider: 'google' });
    expect(googleStreamChat).toHaveBeenCalledWith([{ role: 'user', content: 'Stream' }], {
      provider: 'google',
    });
  });

  it('lanza errores explícitos para groq (legado) o proveedores desconocidos', () => {
    const { factory } = buildFactory('minimax');

    expect(() => factory.get('groq')).toThrow(/Groq provider is not registered/);
    expect(() => factory.get('unknown' as any)).toThrow(/Unknown AI provider/);
  });
});
