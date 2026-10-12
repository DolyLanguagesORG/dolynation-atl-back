import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import { AIProvider, ChatMessage } from './ai-provider.interface';
import { MiniMaxProvider } from './MiniMax-M3.provider';

export type ProviderName = 'minimax' | 'groq';

/**
 * Selects and constructs the active AI provider based on config.
 */
@Injectable()
export class AIProviderFactory {
  constructor(
    private readonly config: AppConfigService,
    private readonly minimaxProvider: MiniMaxProvider,
  ) {}

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

  getFullResponse(messages: ChatMessage[]): Promise<string> {
    return this.get().getFullResponse(messages);
  }

  streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    return this.get().streamChat(messages);
  }
}
