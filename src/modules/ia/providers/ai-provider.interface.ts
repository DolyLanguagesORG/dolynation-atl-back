/**
 * Formato estándar de mensaje para los proveedores de IA.
 * Compatible con el formato Chat Completions de OpenAI.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Metadatos descriptivos del proveedor y modelo de IA activo. */
export interface ProviderInfo {
  name: string;
  model: string;
}

/** Contrato común que debe implementar todo proveedor de modelos de lenguaje. */
export interface AIProvider {
  readonly info: ProviderInfo;
  /**
   * Respuesta sin streaming. Devuelve el texto completo generado.
   */
  getFullResponse(messages: ChatMessage[]): Promise<string>;
  /**
   * Respuesta en streaming. Emite fragmentos de texto conforme llegan del proveedor.
   */
  streamChat(messages: ChatMessage[]): AsyncIterable<string>;
}
