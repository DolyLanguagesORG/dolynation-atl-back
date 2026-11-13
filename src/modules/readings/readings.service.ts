import { Inject, Injectable } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AIProviderFactory } from '../ia/providers/ai-provider.factory';
import { PromptBuilderService } from './prompt-generation';
import type {
  DifficultyLevel,
  EnrichedTopic,
  RandomPromptParams,
} from './prompt-generation/catalog.types';
import {
  AiResponseParserService,
  type GeneratedText,
  type EvaluationResult,
} from './ai-response-parser.service';
import { PromptLogService } from './prompt-logs';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CategoryModerationService } from '../moderation/category-moderation.service';
import { canonicalCategoryKey } from '../moderation/category-normalizer';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { readings } from '../../database/drizzle/schema';
import type { Reading, NewReading } from '../../database/drizzle/types';
import { eq, and, isNull, desc } from 'drizzle-orm';
import {
  GenerateReadingDto,
  READING_CEFR_LEVELS,
  READING_DIFFICULTIES,
  type EvaluateReadingDto,
} from './dto/readings.dto';

/** Límite máximo de lecturas pendientes que un usuario puede acumular simultáneamente. */
const MAX_PENDING = 3;

/**
 * Servicio principal de lecturas: coordina la generación en dos pasos con IA,
 * persistencia en PostgreSQL, validación de cuotas/suscripción, evaluación y vocabulario.
 */
@Injectable()
export class ReadingsService {
  constructor(
    private readonly factory: AIProviderFactory,
    private readonly promptGen: PromptBuilderService,
    private readonly parser: AiResponseParserService,
    private readonly promptLogs: PromptLogService,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly moderation: CategoryModerationService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  /**
   * Genera una nueva lectura adaptada a las preferencias, idioma y plan de suscripción del usuario.
   */
  async generate(input: { userId: number; options: GenerateReadingDto }): Promise<Reading> {
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    // Validación de suscripción activa y límites diarios del plan
    await this.subscriptions.assertSubscriptionActive(input.userId);
    await this.subscriptions.assertCanGenerateReading(input.userId);

    // Validación estricta del idioma objetivo obligatorio frente a la selección activa del plan
    const targetLanguage =
      typeof input.options.language === 'string' ? input.options.language.trim().toLowerCase() : '';
    if (!targetLanguage) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        message: 'Target reading language is required (es, en, fr, or it).',
      });
    }
    await this.subscriptions.assertLanguageAllowed(input.userId, targetLanguage);

    const pendingCount = await this.getPendingCount(input.userId);
    if (pendingCount >= MAX_PENDING) {
      throw new AppHttpException(ErrorCode.READING_PENDING_LIMIT_REACHED, { max: MAX_PENDING });
    }

    // Validación dinámica de categoría:
    // La categoría solicitada DEBE estar dentro de las preferencias configuradas por el usuario.
    const userCategories = await this.settings.getCategories(input.userId);
    const requestedCategory = input.options.category.trim();
    const requestedKey = canonicalCategoryKey(requestedCategory);
    const isAllowed = userCategories.some(
      (c) =>
        c.trim().toLowerCase() === requestedCategory.toLowerCase() ||
        (requestedKey.length > 0 && canonicalCategoryKey(c) === requestedKey),
    );

    if (!isAllowed) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
        category: input.options.category,
        message: `Category '${input.options.category}' is not in your configured preferences. Please add it to your categories in settings first.`,
        userCategories,
      });
    }

    await this.moderation.assertCategoryAllowedForReading(requestedCategory);

    // Recuperamos títulos recientes en esta categoría para evitar contenido duplicado o repetitivo
    const recentReadings = await this.db
      .select({ title: readings.title })
      .from(readings)
      .where(
        and(
          eq(readings.userId, input.userId),
          eq(readings.category, input.options.category),
          isNull(readings.deletedAt),
        ),
      )
      .orderBy(desc(readings.createdAt))
      .limit(20);
    const recentTitles = recentReadings.map((r) => r.title);

    const requestedDifficulty: DifficultyLevel = input.options.difficulty ?? 'medium';

    // Paso 1: Prompt intermedio — Lluvia de ideas y enriquecimiento temático.
    // Solicita a la IA un subtema específico novedoso, un ángulo de perspectiva y conceptos clave,
    // enviando hasta los últimos 20 títulos para prohibir repeticiones.
    const fallbackTopic = this.promptGen.buildFallbackEnrichedTopic(
      input.options.category,
      requestedDifficulty,
    );
    const enrichmentPrompt = this.promptGen.buildEnrichmentPrompt({
      category: input.options.category,
      difficulty: requestedDifficulty,
      recentTitles,
      language: targetLanguage,
    });

    let enrichedTopic: EnrichedTopic;
    try {
      const rawEnrichment = await this.factory.getFullResponse([
        { role: 'system', content: enrichmentPrompt.systemPrompt },
        { role: 'user', content: enrichmentPrompt.userPrompt },
      ]);
      enrichedTopic = this.promptGen.parseEnrichmentResponse(rawEnrichment, fallbackTopic);
    } catch (_err) {
      enrichedTopic = fallbackTopic;
    }

    // Paso 2: Prompt final de generación de lectura.
    // Construye el prompt completo con restricciones pedagógicas (CEFR, vocabulario, gramática)
    // e inyecta el subtema enriquecido junto con los conceptos clave.
    const params: RandomPromptParams = this.promptGen.generateRandomParams({
      category: input.options.category,
      difficulty: requestedDifficulty,
      size: input.options.size ?? 'medium',
      subcategories: [enrichedTopic.subtopic],
      uniqueFocusElement: enrichedTopic.uniqueFocusElement,
      keyConcepts: enrichedTopic.keyConcepts,
      avoidTopics: recentTitles,
      language: targetLanguage,
    });
    const prompt = this.promptGen.buildPrompt(params);

    let rawResponse: string;
    try {
      rawResponse = await this.factory.getFullResponse([
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ]);
    } catch (_err) {
      throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE, { operation: 'ai_chat' });
    }

    let parsed: GeneratedText;
    try {
      parsed = this.parser.parseGeneratedText(rawResponse, [
        input.options.category,
        ...userCategories,
      ]);
    } catch (err) {
      await this.promptLogs.logPromptError(
        'text_generation_failed',
        input.userId,
        (err as Error).message,
        prompt.seed,
      );
      throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE, { operation: 'ai_parse' });
    }

    // Forzamos la dificultad y categoría solicitadas para mantener consistencia en la base de datos
    if (parsed.difficulty !== requestedDifficulty) {
      const previousDifficulty = parsed.difficulty;
      parsed = { ...parsed, difficulty: requestedDifficulty };
      // eslint-disable-next-line no-console
      console.warn('Difficulty mismatch between prompt and AI response', {
        userId: input.userId,
        requestedDifficulty,
        aiReturnedDifficulty: previousDifficulty,
        seed: prompt.seed,
      });
    }

    parsed = { ...parsed, category: input.options.category };

    const wordCount = parsed.content.trim().split(/\s+/).filter(Boolean).length;
    const row: NewReading = {
      userId: input.userId,
      title: parsed.title,
      description: parsed.description,
      content: parsed.content,
      category: parsed.category,
      difficulty: parsed.difficulty,
      wordCount,
      status: 'pending',
      createdAt: new Date(),
    };

    const [inserted] = await this.db.insert(readings).values(row).returning();
    if (!inserted) {
      throw new Error('Insert returned no rows');
    }
    await this.promptLogs.logPromptSuccess(
      'text_generated',
      input.userId,
      inserted.id,
      prompt.seed,
      {
        category: prompt.params.category,
        difficulty: prompt.params.difficulty,
        size: prompt.params.size,
        subcategories: prompt.params.subcategories,
        contentType: prompt.params.contentType,
        perspective: prompt.params.perspective,
        uniqueFocusElement: prompt.params.uniqueFocusElement,
        keyConcepts: prompt.params.keyConcepts,
        enrichedSubtopic: enrichedTopic.subtopic,
      },
    );
    return inserted;
  }

  /**
   * Busca una lectura activa por identificador verificando pertenencia al usuario y suscripción vigente.
   */
  async findById(id: number, userId: number): Promise<Reading> {
    await this.subscriptions.assertSubscriptionActive(userId);
    const rows = await this.db
      .select()
      .from(readings)
      .where(and(eq(readings.id, id), isNull(readings.deletedAt)))
      .limit(1);
    const reading = rows[0];
    if (reading?.userId !== userId) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'Reading' });
    }
    return reading;
  }

  /** Lista las lecturas pendientes del usuario ordenadas de la más reciente a la más antigua. */
  async listPending(userId: number): Promise<Reading[]> {
    await this.subscriptions.assertSubscriptionActive(userId);
    return this.db
      .select()
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          eq(readings.status, 'pending'),
          isNull(readings.deletedAt),
        ),
      )
      .orderBy(desc(readings.createdAt));
  }

  /** Lista las lecturas ya evaluadas y completadas por el usuario. */
  async listCompleted(userId: number): Promise<Reading[]> {
    await this.subscriptions.assertSubscriptionActive(userId);
    return this.db
      .select()
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          eq(readings.status, 'completed'),
          isNull(readings.deletedAt),
        ),
      )
      .orderBy(desc(readings.createdAt));
  }

  /**
   * Devuelve la configuración estática que necesita la UI para poblar los selectores de
   * categoría, dificultad y tamaño. Está respaldada por el catálogo del servidor en el
   * generador de prompts para que el frontend nunca ofrezca un valor no soportado.
   */
  getOptions(): {
    categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
    difficulties: string[];
    sizes: { id: string; label: string; wordRange: string; readingTime: string }[];
    cefrLevels: string[];
  } {
    const cats = this.promptGen.getAvailableCategories();
    const sizes = this.promptGen.getAvailableSizes();
    return {
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        subcategories: c.subcategories.map((sub) => ({ id: sub.id, name: sub.name })),
      })),
      difficulties: [...READING_DIFFICULTIES],
      sizes: sizes.map((s) => ({
        id: s.label,
        label: s.label.charAt(0).toUpperCase() + s.label.slice(1),
        wordRange: `${s.min}-${s.max} words`,
        readingTime: s.readingTime,
      })),
      cefrLevels: [...READING_CEFR_LEVELS],
    };
  }

  /**
   * Evalúa con IA el resumen enviado por el usuario frente al texto original y marca la lectura como completada.
   */
  async evaluate(
    id: number,
    userId: number,
    dto: EvaluateReadingDto,
  ): Promise<EvaluationResult & { reading: Reading }> {
    const reading = await this.findById(id, userId);
    if (reading.status !== 'pending') {
      throw new AppHttpException(ErrorCode.READING_ALREADY_EVALUATED, { readingId: id });
    }

    const systemPrompt = `You are an English comprehension evaluator for language learners.
Your task is to evaluate if the user correctly understood the main idea of a given text.
You must respond ONLY with a JSON object in this exact format: {"score": <number>, "passed": <boolean>, "feedback": "<string>"}
- "score" is a number from 0 to 100 representing how well the user understood the text
- "passed" is true if score >= 80, false otherwise
- "feedback" is a brief (1-2 sentences) explanation of the evaluation
Do not include any other text, explanation, or formatting. Only the JSON object.`;

    const userPrompt = `Here is the original text the user read:
"""
Title: ${reading.title}

${reading.content}
"""

Here is the user's summary of the text:
"""
${dto.userResponse}
"""

Evaluate how well the user understood the main idea of the text.`;

    const raw = await this.factory.getFullResponse([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const result = this.parser.parseEvaluation(raw);
    const [updated] = await this.db
      .update(readings)
      .set({
        score: result.score,
        passed: result.passed,
        userResponse: dto.userResponse,
        feedback: result.feedback,
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(readings.id, id))
      .returning();

    if (!updated) {
      throw new Error('Update returned no rows');
    }
    // Se conservan explícitamente los valores recién escritos (userResponse, feedback, status='completed')
    // junto con la fila actualizada devuelta por PostgreSQL.
    return {
      score: result.score,
      passed: result.passed,
      feedback: result.feedback,
      userResponse: dto.userResponse,
      reading: updated,
    };
  }

  /**
   * Explica el significado de una palabra dentro del contexto de la lectura y descuenta la cuota diaria.
   */
  async explain(
    id: number,
    userId: number,
    word: string,
    context?: string,
  ): Promise<{ explanation: string; reading: Reading }> {
    await this.subscriptions.assertSubscriptionActive(userId);
    await this.subscriptions.assertCanAskQuestion(userId);
    const reading = await this.findById(id, userId);

    const systemPrompt = `You are an English vocabulary explainer for language learners.
Given a word (and optionally its context in a sentence), respond ONLY with a JSON object:
{"explanation": "<string>"}
The explanation should be 1-2 sentences, simple enough for a B1-B2 learner.`;

    const userPrompt = context
      ? `Explain the word "${word}" as used in this context: "${context}".`
      : `Explain the English word "${word}" in simple terms.`;

    const raw = await this.factory.getFullResponse([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    let explanation: string;
    try {
      const parsed = JSON.parse(
        raw
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim(),
      ) as { explanation?: string };
      explanation = String(parsed.explanation ?? raw.trim());
    } catch {
      explanation = raw.trim();
    }

    await this.subscriptions.recordExplanation({
      readingId: id,
      userId,
      word,
      context,
      explanation,
    });

    return { explanation, reading };
  }

  /**
   * Marca una lectura como eliminada lógicamente (`deletedAt`) tras validar propiedad y vigencia.
   */
  async remove(id: number, userId: number): Promise<void> {
    await this.findById(id, userId);
    await this.db
      .update(readings)
      .set({ deletedAt: new Date() })
      .where(and(eq(readings.id, id), eq(readings.userId, userId)));
  }

  /** Cuenta cuántas lecturas pendientes tiene actualmente el usuario. */
  private async getPendingCount(userId: number): Promise<number> {
    const pending = await this.listPending(userId);
    return pending.length;
  }
}
