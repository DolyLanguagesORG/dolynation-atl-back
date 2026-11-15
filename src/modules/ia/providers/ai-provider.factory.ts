import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import type {
  AIProvider,
  AIRequestOptions,
  ChatMessage,
  ProviderName,
} from './ai-provider.interface';
import { GoogleProvider } from './google.provider';
import { MiniMaxProvider } from './MiniMax-M3.provider';

export type { ProviderName };

/**
 * Selecciona y expone el proveedor de IA activo o solicitado explícitamente en código.
 */
@Injectable()
export class AIProviderFactory {
  constructor(
    private readonly config: AppConfigService,
    private readonly minimaxProvider: MiniMaxProvider,
    private readonly googleProvider: GoogleProvider,
  ) {}

  /**
   * Resuelve el identificador efectivo de proveedor (explícito o predeterminado en configuración).
   */
  resolveProviderName(name?: ProviderName): ProviderName {
    return name ?? this.config.ai.defaultProvider;
  }

  /**
   * Obtiene la instancia de proveedor solicitada o la predeterminada en configuración.
   */
  get(name?: ProviderName): AIProvider {
    const requested = this.resolveProviderName(name);
    switch (requested) {
      case 'minimax':
        return this.minimaxProvider;
      case 'google':
        return this.googleProvider;
      case 'groq':
        throw new Error('Groq provider is not registered. Re-add the GroqProvider to the factory.');
      default:
        throw new Error(`Unknown AI provider: ${String(requested)}`);
    }
  }

  /**
   * Solicita una respuesta completa (sin streaming) al proveedor indicado en `options.provider` o al activo.
   */
  getFullResponse(messages: ChatMessage[], options?: AIRequestOptions): Promise<string> {
    return this.get(options?.provider).getFullResponse(messages, options);
  }

  /**
   * Inicia un flujo de respuesta en streaming usando el proveedor indicado en `options.provider` o el activo.
   */
  streamChat(messages: ChatMessage[], options?: AIRequestOptions): AsyncIterable<string> {
    return this.get(options?.provider).streamChat(messages, options);
  }
}
