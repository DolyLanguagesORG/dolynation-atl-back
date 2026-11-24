import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import type {
  AIProvider,
  AIRequestOptions,
  ChatMessage,
  ProviderInfo,
} from './ai-provider.interface';
import {
  extractChatCompletionText,
  postOpenAICompatibleChat,
  streamOpenAICompatibleChat,
} from './openai-compatible-chat.helper';

/**
 * Proveedor de IA conectado a Google AI Studio (Gemini API vía endpoint compatible con OpenAI).
 * Usa por defecto `gemini-3.5-flash-lite` (disponible en el Free Tier) y soporta streaming SSE.
 */
@Injectable()
export class GoogleProvider implements AIProvider {
  private readonly logger = new Logger(GoogleProvider.name);
  readonly info: ProviderInfo;

  constructor(private readonly config: AppConfigService) {
    const google = this.config.ai.google;
    this.info = { name: 'Google-Gemini', model: google.model };
  }

  /** Obtiene la clave API de Google AI Studio o falla de forma explícita si falta. */
  private get apiKey(): string {
    const key = this.config.ai.google.apiKey;
    if (!key) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }
    return key;
  }

  /** Construye el cuerpo JSON compatible con Gemini Chat Completions. */
  private buildRequestBody(
    messages: ChatMessage[],
    stream = false,
    options?: AIRequestOptions,
  ): { body: Record<string, unknown>; model: string; maxTokens: number } {
    const google = this.config.ai.google;
    const requestedModel = options?.model?.trim();
    const model = requestedModel && requestedModel.length > 0 ? requestedModel : google.model;
    const maxTokens = options?.maxTokens ?? google.maxTokens;
    const isGemini25 = /^gemini-2\.5(?:-|$)/i.test(model);

    // En Gemini 3.x (p. ej. gemini-3.5-flash-lite), `reasoning_effort: "none"` devuelve HTTP 400;
    // el nivel más ligero compatible para tareas de clasificación/moderación es `"minimal"`.
    const reasoningEffort = options?.disableThinking
      ? isGemini25
        ? 'none'
        : 'minimal'
      : options?.reasoningEffort;

    return {
      model,
      maxTokens,
      body: {
        model,
        messages,
        max_completion_tokens: maxTokens,
        temperature: options?.temperature ?? google.temperature,
        stream,
        ...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
      },
    };
  }

  /**
   * Envía los mensajes a Gemini y devuelve el texto generado limpio de bloques de razonamiento.
   */
  async getFullResponse(messages: ChatMessage[], options?: AIRequestOptions): Promise<string> {
    const google = this.config.ai.google;
    const { body, model, maxTokens } = this.buildRequestBody(messages, false, options);
    const data = await postOpenAICompatibleChat({
      providerLabel: 'Google Gemini',
      endpoint: google.endpoint,
      apiKey: this.apiKey,
      timeoutMs: google.timeoutMs,
      body,
      logger: this.logger,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    return extractChatCompletionText({
      data,
      providerName: this.info.name,
      providerLabel: 'Google Gemini',
      model,
      maxTokens,
      logger: this.logger,
    });
  }

  /**
   * Abre un flujo SSE contra Google Gemini y emite fragmentos de texto en streaming.
   */
  streamChat(messages: ChatMessage[], options?: AIRequestOptions): AsyncIterable<string> {
    const google = this.config.ai.google;
    const { body } = this.buildRequestBody(messages, true, options);
    return streamOpenAICompatibleChat({
      providerLabel: 'Google Gemini',
      endpoint: google.endpoint,
      apiKey: this.apiKey,
      timeoutMs: google.timeoutMs,
      body,
      logger: this.logger,
    });
  }
}
