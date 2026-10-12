/**
 * Standard message format for AI providers.
 * Compatible with OpenAI's Chat Completions message format.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderInfo {
  name: string;
  model: string;
}

export interface AIProvider {
  readonly info: ProviderInfo;
  /**
   * Non-streaming response. Returns the full text.
   */
  getFullResponse(messages: ChatMessage[]): Promise<string>;
  /**
   * Streaming response. Yields text chunks as they arrive.
   */
  streamChat(messages: ChatMessage[]): AsyncIterable<string>;
}
