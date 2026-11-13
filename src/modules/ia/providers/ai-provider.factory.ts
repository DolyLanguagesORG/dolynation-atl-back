import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import { AIProvider, ChatMessage } from './ai-provider.interface';
import { MiniMaxProvider } from './MiniMax-M3.provider';

/** Identificadores de proveedores de IA soportados por la configuración. */
export type ProviderName = 'minimax' | 'groq';

/**
 * Selecciona y expone el proveedor de IA activo según la configuración de la aplicación.
 */
@Injectable()
export class AIProviderFactory {
  constructor(
    private readonly config: AppConfigService,
    private readonly minimaxProvider: MiniMaxProvider,
  ) {}

  /**
   * Obtiene la instancia de proveedor solicitada o la predeterminada en configuración.
   */
  get(name?: ProviderName): AIProvider {
    const requested = name ?? this.config.ai.defaultProvider;
    switch (requested) {
      case 'minimax':
        return this.minimaxProvider;
      case 'groq':
        throw new Error('Groq provider is not registered. Re-add the GroqProvider to the factory.');
      default:
        throw new Error(`Unknown AI provider: ${String(requested)}`);
    }
  }

  /**
   * Solicita una respuesta completa (sin streaming) al proveedor activo.
   */
  getFullResponse(messages: ChatMessage[]): Promise<string> {
    return this.get().getFullResponse(messages);
  }

  /**
   * Inicia un flujo de respuesta en streaming usando el proveedor activo.
   */
  streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    return this.get().streamChat(messages);
  }
}
