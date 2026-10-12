import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/env.config';
import { AIProvider, ChatMessage, ProviderInfo } from './ai-provider.interface';
import { ThinkBlockParser } from './think-block.parser';

interface MiniMaxChatResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: { total_tokens: number; prompt_tokens: number; completion_tokens: number };
}

@Injectable()
export class MiniMaxProvider implements AIProvider {
  private readonly logger = new Logger(MiniMaxProvider.name);
  readonly info: ProviderInfo;

  constructor(private readonly config: AppConfigService) {
    const minimax = this.config.ai.minimax;
    this.info = { name: 'MiniMax-M3', model: minimax.model };
  }

  private get apiKey(): string {
    const key = this.config.ai.minimax.apiKey;
    if (!key) {
      throw new Error('MINIMAX_API_KEY is not configured');
    }
    return key;
  }

  private buildRequestBody(messages: ChatMessage[]): Record<string, unknown> {
    const minimax = this.config.ai.minimax;
    return {
      model: minimax.model,
      messages,
      max_completion_tokens: minimax.maxTokens,
      temperature: minimax.temperature,
      top_p: 1,
      stream: false,
    };
  }

  private async postJson(messages: ChatMessage[]): Promise<MiniMaxChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.ai.minimax.timeoutMs);

    try {
      const res = await fetch(this.config.ai.minimax.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildRequestBody(messages)),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '<no body>');
        throw new Error(`MiniMax M3 request failed: ${res.status} ${res.statusText} - ${errText}`);
      }
      return (await res.json()) as MiniMaxChatResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  async getFullResponse(messages: ChatMessage[]): Promise<string> {
    const data = await this.postJson(messages);
    const content = data.choices[0]?.message.content ?? '';
    if (data.usage) {
      this.logger.log({
        provider: this.info.name,
        model: this.info.model,
        prompt_tokens: data.usage.prompt_tokens,
        completion_tokens: data.usage.completion_tokens,
      });
    }
    return stripThinkBlock(content);
  }

  async *streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    const minimax = this.config.ai.minimax;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), minimax.timeoutMs);

    try {
      const res = await fetch(minimax.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          ...this.buildRequestBody(messages),
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '<no body>');
        throw new Error(`MiniMax M3 stream failed: ${res.status} - ${errText}`);
      }
      if (!res.body) {
        throw new Error('MiniMax M3 response has no body');
      }

      const parser = new ThinkBlockParser();
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
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
                parsed = JSON.parse(payload);
              } catch {
                continue;
              }
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                for (const ev of parser.consume(delta)) {
                  if (ev.type === 'text') yield ev.value;
                }
              }
            }
          }
        }
      } finally {
        for (const ev of parser.flush()) {
          if (ev.type === 'text') yield ev.value;
        }
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function stripThinkBlock(text: string): string {
  const openIdx = text.indexOf('<think>');
  if (openIdx === -1) return text;
  const closeIdx = text.indexOf('</think>', openIdx);
  if (closeIdx === -1) return '';
  return text.slice(closeIdx + '</think>'.length).replace(/^\s+/, '');
}
