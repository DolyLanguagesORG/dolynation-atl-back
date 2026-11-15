import type { Logger } from '@nestjs/common';
import { ThinkBlockParser } from './think-block.parser';

/** Estructura común de respuesta JSON para endpoints Chat Completions compatibles con OpenAI. */
export interface OpenAICompatibleChatResponse {
  choices?: Array<{
    message?: { content?: string | null; reasoning_content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

/** Parámetros HTTP compartidos para invocar proveedores compatibles con OpenAI Chat Completions. */
export interface OpenAICompatibleRequestConfig {
  providerLabel: string;
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
  body: Record<string, unknown>;
}

/** Ejecuta una petición POST JSON con control de timeout mediante AbortController. */
export async function postOpenAICompatibleChat(
  config: OpenAICompatibleRequestConfig,
): Promise<OpenAICompatibleChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(config.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '<no body>');
      throw new Error(
        `${config.providerLabel} request failed: ${res.status} ${res.statusText} - ${errText}`,
      );
    }
    return (await res.json()) as OpenAICompatibleChatResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** Extrae el texto final de una respuesta Chat Completions, registra métricas y detecta truncamientos. */
export function extractChatCompletionText(params: {
  data: OpenAICompatibleChatResponse;
  providerName: string;
  providerLabel: string;
  model: string;
  maxTokens: number;
  logger: Logger;
}): string {
  const choice = params.data.choices?.[0];
  const content = choice?.message?.content ?? '';
  if (params.data.usage) {
    params.logger.log({
      provider: params.providerName,
      model: params.model,
      prompt_tokens: params.data.usage.prompt_tokens,
      completion_tokens: params.data.usage.completion_tokens,
      reasoning_tokens: params.data.usage.completion_tokens_details?.reasoning_tokens,
      finish_reason: choice?.finish_reason,
    });
  }
  const cleaned = stripThinkBlock(content);
  if (!cleaned.trim() && choice?.finish_reason === 'length') {
    throw new Error(
      `${params.providerLabel} truncated output at max_completion_tokens=${params.maxTokens} before emitting content`,
    );
  }
  return cleaned;
}

/** Abre un flujo SSE compatible con OpenAI y emite fragmentos de texto limpios de bloques `<think>`. */
export async function* streamOpenAICompatibleChat(
  config: OpenAICompatibleRequestConfig,
): AsyncIterable<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(config.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '<no body>');
      throw new Error(`${config.providerLabel} stream failed: ${res.status} - ${errText}`);
    }
    if (!res.body) {
      throw new Error(`${config.providerLabel} response has no body`);
    }

    const parser = new ThinkBlockParser();
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        buffer += decoder.decode(chunk.value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const rawEvent of events) {
          const lines = rawEvent.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]' || !payload) continue;
            let parsed: { choices?: Array<{ delta?: { content?: string } }> };
            try {
              parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
            } catch {
              continue;
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              for (const ev of parser.consume(delta)) {
                yield ev.value;
              }
            }
          }
        }
      }
    } finally {
      for (const ev of parser.flush()) {
        yield ev.value;
      }
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Elimina el bloque inicial `<think>...</think>` emitido por un modelo antes de la respuesta final.
 */
export function stripThinkBlock(text: string): string {
  const openIdx = text.indexOf('<think>');
  if (openIdx === -1) return text;
  const closeIdx = text.indexOf('</think>', openIdx);
  if (closeIdx === -1) return '';
  return text.slice(closeIdx + '</think>'.length).replace(/^\s+/, '');
}
