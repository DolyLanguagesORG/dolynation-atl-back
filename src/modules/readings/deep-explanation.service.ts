import { Injectable, Optional } from '@nestjs/common';
import { AiDegradedService } from '../ia/ai-degraded.service';
import type { ChatMessage } from '../ia/providers/ai-provider.interface';
import { AuditLogService } from '../logs';
import { LANGUAGE_NAMES } from './prompt-generation';
import { ReadingsService } from './readings.service';
import { DeepExplanationRateLimitService } from './deep-explanation-rate-limit.service';

/** Datos de la lectura que alimentan el prompt de explicación detallada. */
export interface DeepExplanationPromptParams {
  word: string;
  context?: string;
  language: string;
  difficulty: string;
  readingTitle: string;
}

/**
 * Arma en el servidor el prompt de la explicación detallada. Es el mismo texto que antes
 * armaba el front y mandaba a `/ia/chat`; ahora el cliente solo envía la palabra y el
 * fragmento, y el idioma y nivel salen de la lectura guardada.
 */
export function buildDeepExplanationPrompt(params: DeepExplanationPromptParams): ChatMessage[] {
  const langName = LANGUAGE_NAMES[params.language.toLowerCase()] ?? 'English';
  const excerpt = params.context?.trim() ? params.context : params.word;
  return [
    {
      role: 'system',
      content: `You are a ${langName} language coach for DolyNation learners (target level: ${params.difficulty}). Write strictly in natural ${langName} (never mix or translate into another language). Provide 2-3 clear sentences deepening the pragmatic nuance, grammar role, and a natural everyday example.`,
    },
    {
      role: 'user',
      content: `Deepen the explanation of "${params.word}" in the ${langName} reading "${params.readingTitle}". Excerpt: "${excerpt}".`,
    },
  ];
}

/**
 * Explicación detallada de una palabra o frase dentro de una lectura del usuario.
 * Reemplaza el uso de `/ia/chat` desde el front para este botón.
 */
@Injectable()
export class DeepExplanationService {
  constructor(
    private readonly readings: ReadingsService,
    private readonly ai: AiDegradedService,
    private readonly rateLimit: DeepExplanationRateLimitService,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

  /**
   * Verifica que la lectura sea del usuario (y su plan activo), aplica el límite por
   * usuario y devuelve el texto generado por la IA.
   */
  async explainDeep(
    readingId: number,
    userId: number,
    word: string,
    context?: string,
  ): Promise<{ text: string }> {
    const reading = await this.readings.findById(readingId, userId);
    this.rateLimit.assertWithinLimit(userId);

    const language = ((reading.language as string | undefined) ?? 'en').toLowerCase();
    const difficulty = (reading.difficulty as string | undefined) ?? 'medium';
    const messages = buildDeepExplanationPrompt({
      word: word.trim(),
      ...(context !== undefined ? { context } : {}),
      language,
      difficulty,
      readingTitle: reading.title,
    });

    const startedAt = Date.now();
    const text = await this.ai.getFullResponse(messages);

    await this.auditLogs?.logEvent({
      module: 'readings',
      action: 'AI',
      event: 'reading.deep_explanation_generated',
      entityType: 'readings',
      entityId: readingId,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Deep explanation generated on reading #${readingId}`,
      metadata: {
        readingId,
        language,
        difficulty,
        wordLength: word.length,
        hasContext: Boolean(context),
        responseLength: text.length,
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    });

    return { text };
  }
}
