/** Identificadores de proveedores de IA soportados por la configuración del sistema. */
export type ProviderName = 'minimax' | 'google' | 'groq';

/**
 * Formato estándar de mensaje para los proveedores de IA.
 * Compatible con el formato Chat Completions de OpenAI.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Opciones por llamada para seleccionar proveedor y ajustar presupuesto, temperatura y razonamiento. */
export interface AIRequestOptions {
  /** Proveedor de IA puntual para esta llamada; si se omite, usa `AI_DEFAULT_PROVIDER`. */
  provider?: ProviderName;
  /** Límite máximo de tokens de salida para esta petición concreta. */
  maxTokens?: number;
  /** Desactiva el bloque de razonamiento cuando el modelo activo lo soporta (p. ej. MiniMax-M3 en tareas ligeras). */
  disableThinking?: boolean;
  /** Modelo alternativo puntual para esta llamada (p. ej. fallback a MiniMax-M3 tras detectar mezcla de idioma). */
  model?: string;
  /** Temperatura puntual para ajustar determinismo vs. variedad sin cambiar la configuración global. */
  temperature?: number;
  /** Nivel de esfuerzo de razonamiento en modelos compatibles (p. ej. MiniMax-M3 o Gemini 3). */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
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
  getFullResponse(messages: ChatMessage[], options?: AIRequestOptions): Promise<string>;
  /**
   * Respuesta en streaming. Emite fragmentos de texto conforme llegan del proveedor.
   */
  streamChat(messages: ChatMessage[], options?: AIRequestOptions): AsyncIterable<string>;
}
