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
 * Proveedor de IA conectado a la API HTTP de MiniMax M3.
 * Soporta llamadas síncronas y respuestas SSE en streaming filtrando bloques `<think>`.
 */
@Injectable()
export class MiniMaxProvider implements AIProvider {
  private readonly logger = new Logger(MiniMaxProvider.name);
  readonly info: ProviderInfo;

  constructor(private readonly config: AppConfigService) {
    const minimax = this.config.ai.minimax;
    this.info = { name: 'MiniMax-M3', model: minimax.model };
  }

  /** Obtiene la clave API configurada o falla de forma explícita si falta. */
  private get apiKey(): string {
    const key = this.config.ai.minimax.apiKey;
    if (!key) {
      throw new Error('MINIMAX_API_KEY is not configured');
    }
    return key;
  }

  /** Construye el cuerpo JSON base para peticiones de chat al endpoint de MiniMax. */
  private buildRequestBody(
    messages: ChatMessage[],
    stream = false,
    options?: AIRequestOptions,
  ): { body: Record<string, unknown>; model: string; maxTokens: number } {
    const minimax = this.config.ai.minimax;
    const requestedModel = options?.model?.trim();
    const model = requestedModel && requestedModel.length > 0 ? requestedModel : minimax.model;
    const maxTokens = options?.maxTokens ?? minimax.maxTokens;
    const isM3Family = /^minimax-m3(?:\.|-|$)/i.test(model);
    const disableThinking = Boolean(options?.disableThinking) && /^minimax-m3$/i.test(model);
    const reasoningEffort = options?.reasoningEffort ?? minimax.reasoningEffort;

    // Omitimos response_format json_object y reasoning_effort en MiniMax-M2.5 porque nuestras pruebas
    // en ES/FR/IT demostraron inyección de caracteres CJK al forzarlos; los prompts piden JSON explícito.
    return {
      model,
      maxTokens,
      body: {
        model,
        messages,
        max_completion_tokens: maxTokens,
        temperature: options?.temperature ?? minimax.temperature,
        top_p: 0.95,
        stream,
        ...(disableThinking
          ? { thinking: { type: 'disabled' } }
          : {
              ...(isM3Family ? { reasoning_effort: reasoningEffort } : {}),
              reasoning_split: true,
            }),
      },
    };
  }

  /**
   * Envía los mensajes al modelo y devuelve el contenido final eliminando bloques `<think>`.
   */
  async getFullResponse(messages: ChatMessage[], options?: AIRequestOptions): Promise<string> {
    const minimax = this.config.ai.minimax;
    const { body, model, maxTokens } = this.buildRequestBody(messages, false, options);
    const data = await postOpenAICompatibleChat({
      providerLabel: 'MiniMax M3',
      endpoint: minimax.endpoint,
      apiKey: this.apiKey,
      timeoutMs: minimax.timeoutMs,
      body,
    });

    return extractChatCompletionText({
      data,
      providerName: this.info.name,
      providerLabel: 'MiniMax M3',
      model,
      maxTokens,
      logger: this.logger,
    });
  }

  /**
   * Abre un flujo SSE contra MiniMax y emite fragmentos de texto ya limpios de razonamiento interno.
   */
  streamChat(messages: ChatMessage[], options?: AIRequestOptions): AsyncIterable<string> {
    const minimax = this.config.ai.minimax;
    const { body } = this.buildRequestBody(messages, true, options);
    return streamOpenAICompatibleChat({
      providerLabel: 'MiniMax M3',
      endpoint: minimax.endpoint,
      apiKey: this.apiKey,
      timeoutMs: minimax.timeoutMs,
      body,
    });
  }
}
