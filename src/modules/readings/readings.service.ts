import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AIProviderFactory } from '../ia/providers/ai-provider.factory';
import type { AIRequestOptions, ProviderName } from '../ia/providers/ai-provider.interface';
import { GoogleDecisionsService } from '../ia/decisions/google-decisions.service';
import { LANGUAGE_NAMES, PromptBuilderService, pickExplorationLens } from './prompt-generation';
import type {
  DifficultyLevel,
  GeneratedPrompt,
  RandomPromptParams,
  RecentReadingSummary,
  TextSize,
} from './prompt-generation/catalog.types';
import {
  buildPurityCorrectionNote,
  buildPurityFallbackSequence,
  inspectTextsPurity,
  scorePuritySeverity,
} from './language-purity.guard';
import {
  AiResponseParserService,
  type EvaluationResult,
  type GeneratedText,
} from './ai-response-parser.service';
import { PromptLogService } from './prompt-logs';
import { AuditLogService, ErrorLogService } from '../logs';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { MIN_USER_CATEGORIES } from '../settings/settings.constants';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CategoryModerationService } from '../moderation/category-moderation.service';
import { canonicalCategoryKey } from '../moderation/category-normalizer';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb, DrizzleExecutor } from '../../database/database.module';
import {
  friendStreakDays,
  friendStreaks,
  readingExplanations,
  readings,
  users,
} from '../../database/drizzle/schema';
import type {
  ExplanationEntryType,
  NewReading,
  Reading,
  ReadingExplanation,
} from '../../database/drizzle/types';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { getDateKeyInTimeZone } from '../subscriptions/subscriptions.constants';
import type { ExplanationResultDto, GlossaryEntryDto } from '../../common/types/api-response.dto';
import {
  GenerateReadingDto,
  READING_CEFR_LEVELS,
  READING_DIFFICULTIES,
  type EvaluateReadingDto,
  type GlossaryQueryDto,
} from './dto/readings.dto';

/** Límite máximo de lecturas pendientes que un usuario puede acumular simultáneamente. */
const MAX_PENDING = 3;

/** Máximo de lecturas recientes en la categoría comparadas para evitar repetición. */
const RECENT_READINGS_LIMIT = 10;

/** Máximo de regeneraciones adicionales cuando Google Decisions detecta alta similitud semántica. */
const MAX_SEMANTIC_REGENERATIONS = 2;

/** Puntaje mínimo (escala 0..4) para considerar que la lectura expresa lo mismo que otra reciente. */
const SEMANTIC_SIMILARITY_REJECT_SCORE = 2.35;

/**
 * Convierte el fallo del proveedor de IA en una excepcion que **si explica**.
 *
 * El proveedor falla por motivos muy distintos y el cliente reacciona
 * distinto a cada uno:
 *
 * - `AI_RATE_LIMITED` (429): se acabo la cuota del provider. Reintentar no
 *   sirve: hay que esperar. Decirlo evita que el usuario piense que la
 *   aplicacion esta caida.
 * - `SERVICE_UNAVAILABLE` (503) con `ai-circuit-open`: el provider fallo
 *   varias veces seguidas y esta en cuarentena; se reintentara en breve.
 * - `SERVICE_UNAVAILABLE` (503) con `ai-call-failed`: el provider fallo y
 *   no se pudo reintentar.
 *
 * Cuando el error ya es una `AppHttpException` (el proveedor de IA la lanza
 * con su motivo), se respeta tal cual: no se envuelve en otra.
 */
function toAiException(err: unknown): AppHttpException {
  if (err instanceof AppHttpException) {
    const response = err.getResponse() as {
      code?: ErrorCode;
    };
    const code = response.code ?? ErrorCode.SERVICE_UNAVAILABLE;
    return new AppHttpException(code);
  }
  return new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE);
}

/**
 * Coordina la generación, evaluación, consulta y explicación de lecturas con sus validaciones de dominio.
 */
@Injectable()
export class ReadingsService {
  private readonly logger = new Logger(ReadingsService.name);

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
    @Optional() private readonly googleDecisions?: GoogleDecisionsService,
    @Optional() private readonly auditLogs?: AuditLogService,
    @Optional() private readonly errorLogs?: ErrorLogService,
  ) {}

  /** Genera la única lectura de IA del día de una racha; las copias no consumen cuota. */
  async generateFriendStreakReading(input: {
    userId: number;
    category: string;
    language: string;
    difficulty: DifficultyLevel;
    size: TextSize;
    friendStreakDayId?: number;
  }): Promise<Reading> {
    return this.generate({
      userId: input.userId,
      options: {
        category: input.category,
        language: input.language as 'es' | 'en' | 'fr' | 'it',
        difficulty: input.difficulty,
        size: input.size,
      },
      originType: 'friend_streak',
      friendStreakDayId: input.friendStreakDayId,
    });
  }

  /**
   * Genera una nueva lectura adaptada a las preferencias, idioma y plan de suscripción del usuario.
   */
  async generate(input: {
    userId: number;
    options: GenerateReadingDto;
    aiOptions?: AIRequestOptions;
    originType?: 'personal' | 'friend_streak';
    friendStreakDayId?: number;
    /** Se aborta si el cliente se desconecta o vence el plazo: entonces no se guarda nada. */
    signal?: AbortSignal;
  }): Promise<Reading> {
    try {
      return await this.generateCancellable(input);
    } catch (err) {
      if (input.signal?.aborted) {
        throw new AppHttpException(ErrorCode.AI_GENERATION_TIMEOUT);
      }
      throw err;
    }
  }

  private async generateCancellable(input: {
    userId: number;
    options: GenerateReadingDto;
    aiOptions?: AIRequestOptions;
    originType?: 'personal' | 'friend_streak';
    friendStreakDayId?: number;
    signal?: AbortSignal;
  }): Promise<Reading> {
    const originType = input.originType ?? 'personal';
    const aiOptions: AIRequestOptions | undefined = input.signal
      ? { ...input.aiOptions, signal: input.signal }
      : input.aiOptions;
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    // Validación de suscripción activa y límites diarios del plan
    await this.subscriptions.assertSubscriptionActive(input.userId);
    if (originType === 'personal') await this.subscriptions.assertCanGenerateReading(input.userId);

    // Validación estricta del idioma objetivo obligatorio frente a la selección activa del plan
    const targetLanguage =
      typeof input.options.language === 'string' ? input.options.language.trim().toLowerCase() : '';
    if (!targetLanguage) {
      throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
        message: 'Target reading language is required (es, en, fr, or it).',
      });
    }
    await this.subscriptions.assertLanguageAllowed(input.userId, targetLanguage);

    const pendingCount = originType === 'personal' ? await this.getPendingCount(input.userId) : 0;
    if (originType === 'personal' && pendingCount >= MAX_PENDING) {
      throw new AppHttpException(ErrorCode.READING_PENDING_LIMIT_REACHED, { max: MAX_PENDING });
    }

    // Validación dinámica de categoría:
    // La categoría solicitada DEBE estar dentro de las preferencias configuradas por el usuario.
    const userCategories =
      originType === 'personal' ? await this.settings.getCategories(input.userId) : [];
    if (originType === 'personal' && userCategories.length < MIN_USER_CATEGORIES) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
        category: input.options.category,
        minCategories: MIN_USER_CATEGORIES,
        currentCount: userCategories.length,
        message: `You must configure at least ${MIN_USER_CATEGORIES} categories in your preferences before generating readings.`,
        userCategories,
      });
    }
    const requestedCategory = input.options.category.trim();
    const requestedKey = canonicalCategoryKey(requestedCategory);
    const isAllowed = userCategories.some(
      (c) =>
        c.trim().toLowerCase() === requestedCategory.toLowerCase() ||
        (requestedKey.length > 0 && canonicalCategoryKey(c) === requestedKey),
    );

    if (originType === 'personal' && !isAllowed) {
      throw new AppHttpException(ErrorCode.RESOURCE_FORBIDDEN, {
        category: input.options.category,
        message: `Category '${input.options.category}' is not in your configured preferences. Please add it to your categories in settings first.`,
        userCategories,
      });
    }

    await this.moderation.assertCategoryAllowedForReading(requestedCategory);

    // Recuperamos hasta las últimas 10 lecturas (título y descripción) para evitar repetición temática y semántica
    const recentSummaries = await this.fetchRecentReadingSummaries(
      input.userId,
      input.options.category,
      requestedCategory,
    );

    const requestedDifficulty: DifficultyLevel = input.options.difficulty ?? 'medium';
    const targetSize: TextSize = input.options.size ?? 'medium';
    const decisionsEnabled =
      recentSummaries.length > 0 && Boolean(this.googleDecisions?.isConfigured());
    const maxAttempts = 1 + (decisionsEnabled ? MAX_SEMANTIC_REGENERATIONS : 0);

    const startedAt = Date.now();
    const usedLensIds = new Set<string>();
    const rejectedAngles: string[] = [];
    let chosenPrompt: GeneratedPrompt | null = null;
    let parsed: GeneratedText | null = null;
    let lowestSimilarityScore = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      input.signal?.throwIfAborted();
      const { prompt, lensId } = await this.buildDynamicReadingPrompt({
        category: input.options.category,
        difficulty: requestedDifficulty,
        size: targetSize,
        language: targetLanguage,
        recentReadings: recentSummaries,
        usedLensIds,
        rejectedAngles,
        ...(aiOptions !== undefined ? { aiOptions } : {}),
      });
      usedLensIds.add(lensId);

      input.signal?.throwIfAborted();
      const candidate = await this.executeWithPurityGuard<GeneratedText>({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        targetLanguage,
        ...(aiOptions !== undefined ? { aiOptions } : {}),
        parse: (raw) =>
          this.parser.parseGeneratedText(raw, [input.options.category, ...userCategories]),
        extractTexts: (item) => [item.title, item.description, item.content],
        onPrimaryError: (err) => {
          // Se conserva el motivo real del provider (cuota agotada, circuito
          // abierto, fallo de llamada): sin el, el cliente solo ve un 503
          // generico y no sabe si esperar o reintentar.
          throw toAiException(err);
        },
        onParseError: async (err) => {
          await this.promptLogs.logPromptError(
            'text_generation_failed',
            input.userId,
            (err as Error).message,
            prompt.seed,
          );
          throw toAiException(err);
        },
      });

      const { repetitive, score } = await this.evaluateSemanticRepetition(
        requestedCategory,
        candidate,
        recentSummaries,
      );

      if (!repetitive) {
        chosenPrompt = prompt;
        parsed = candidate;
        break;
      }

      if (score < lowestSimilarityScore) {
        lowestSimilarityScore = score;
        chosenPrompt = prompt;
        parsed = candidate;
      }

      rejectedAngles.push(
        candidate.description
          ? `"${candidate.title}" — ${candidate.description}`
          : `"${candidate.title}"`,
      );
      this.logger.log(
        `Regenerating reading for "${requestedCategory}" (attempt ${attempt + 1}/${maxAttempts}): Google Decisions similarity score ${score.toFixed(2)} >= ${SEMANTIC_SIMILARITY_REJECT_SCORE}`,
      );
    }

    if (!chosenPrompt || !parsed) {
      throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE);
    }

    const prompt = chosenPrompt;

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
      originType,
      ...(input.friendStreakDayId ? { friendStreakDayId: input.friendStreakDayId } : {}),
      title: parsed.title,
      description: parsed.description,
      content: parsed.content,
      category: parsed.category,
      difficulty: parsed.difficulty,
      language: targetLanguage,
      wordCount,
      status: 'pending',
      createdAt: new Date(),
    };

    // La IA tarda segundos: los límites revisados al inicio pudieron cambiar mientras tanto.
    // Se vuelven a validar con la fila del usuario bloqueada para que el INSERT sea atómico.
    const inserted = await this.db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId))
        .for('no key update');
      if (originType === 'personal')
        await this.subscriptions.assertCanGenerateReading(input.userId, tx);
      if (originType === 'personal' && (await this.countPending(input.userId, tx)) >= MAX_PENDING) {
        throw new AppHttpException(ErrorCode.READING_PENDING_LIMIT_REACHED, {
          max: MAX_PENDING,
        });
      }
      // Última revisión antes de guardar: si el cliente ya se fue o venció el plazo, no se
      // crea la lectura (ni cuenta para la cuota diaria) y puede reintentar.
      input.signal?.throwIfAborted();
      const [created] = await tx.insert(readings).values(row).returning();
      if (!created) {
        throw new Error('Insert returned no rows');
      }
      return created;
    });
    await this.promptLogs.logPromptSuccess(
      'text_generated',
      input.userId,
      inserted.id,
      prompt.seed,
      {
        category: prompt.params.category,
        language: targetLanguage,
        difficulty: prompt.params.difficulty,
        size: prompt.params.size,
        subcategories: prompt.params.subcategories,
        contentType: prompt.params.contentType,
        perspective: prompt.params.perspective,
        uniqueFocusElement: prompt.params.uniqueFocusElement,
        keyConcepts: prompt.params.keyConcepts,
        enrichedSubtopic: prompt.params.subcategories[0],
      },
    );

    const resolvedProvider =
      input.aiOptions?.provider ??
      (typeof this.factory.resolveProviderName === 'function'
        ? this.factory.resolveProviderName()
        : null);
    await this.auditLogs?.logCreate({
      module: 'readings',
      event: 'reading.generated',
      entityType: 'readings',
      entityId: inserted.id,
      actorUserId: input.userId,
      targetUserId: input.userId,
      summary: `Reading #${inserted.id} generated (${targetLanguage}, ${requestedDifficulty}, "${inserted.category}")`,
      afterState: {
        id: inserted.id,
        userId: inserted.userId,
        title: inserted.title,
        description: inserted.description,
        content: inserted.content,
        category: inserted.category,
        difficulty: inserted.difficulty,
        language: inserted.language,
        wordCount: inserted.wordCount,
        status: inserted.status,
        createdAt: inserted.createdAt,
      },
      metadata: {
        seed: prompt.seed,
        provider: resolvedProvider,
        generationDurationMs: Math.max(0, Date.now() - startedAt),
      },
    });
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
   * Devuelve la configuración estática de opciones de lectura (dificultad, tamaño y niveles CEFR).
   * No existen categorías predefinidas en el servidor; las categorías provienen de cada usuario.
   */
  getOptions(): {
    categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
    difficulties: string[];
    sizes: { id: string; label: string; wordRange: string; readingTime: string }[];
    cefrLevels: string[];
  } {
    const sizes = this.promptGen.getAvailableSizes();
    return {
      categories: [],
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
    aiOptions?: AIRequestOptions,
    operationId?: string,
  ): Promise<EvaluationResult & { reading: Reading }> {
    const reading = await this.findById(id, userId);
    if (reading.status !== 'pending') {
      // La misma operacion, otra vez: se devuelve la evaluacion que ya se
      // hizo. Es el caso del envio sin conexion que se reintenta al volver
      // la red: sin esto, la IA evaluaria dos veces la misma respuesta.
      if (
        operationId &&
        reading.evaluationOperationId &&
        reading.evaluationOperationId === operationId
      ) {
        // The first request may have persisted the evaluation before its streak hook failed.
        // Reconcile here without invoking the AI a second time.
        await this.markFriendStreakCompletion(id, userId);
        return {
          score: reading.score ?? 0,
          passed: reading.passed ?? false,
          feedback: reading.feedback ?? '',
          reading,
        };
      }
      throw new AppHttpException(ErrorCode.READING_ALREADY_EVALUATED, { readingId: id });
    }

    const rawLang = reading.language as string | undefined;
    const readingLanguage = (rawLang ?? 'en').toLowerCase();
    const langLabel = LANGUAGE_NAMES[readingLanguage] ?? 'English';
    const systemPrompt = `You are a ${langLabel} reading comprehension evaluator for language learners.
Your task is to evaluate if the user correctly understood the main idea and key supporting details of a ${langLabel} text.
You must respond ONLY with a JSON object in this exact format: {"score": <number>, "passed": <boolean>, "feedback": "<string>"}
- "score" is a number from 0 to 100 representing how well the user understood the text
- "passed" is true if score >= 80, false otherwise
- "feedback" is a brief (1-2 sentences) constructive explanation written strictly in natural ${langLabel} (100% pure natural ${langLabel}: zero English words, zero bilingual camelCase splices, zero non-Latin scripts; use single quotes or «guillemets» instead of ASCII double quotes inside JSON strings)
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

    const result = await this.executeWithPurityGuard({
      systemPrompt,
      userPrompt,
      targetLanguage: readingLanguage,
      ...(aiOptions !== undefined ? { aiOptions } : {}),
      parse: (raw) => this.parser.parseEvaluation(raw),
      extractTexts: (item) => [item.feedback],
    });
    const [updated] = await this.db
      .update(readings)
      .set({
        score: result.score,
        passed: result.passed,
        userResponse: dto.userResponse,
        feedback: result.feedback,
        status: 'completed',
        // La clave de idempotencia: si este mismo envio vuelve a llegar, se
        // reconoce y no se vuelve a evaluar.
        ...(operationId ? { evaluationOperationId: operationId } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(readings.id, id), eq(readings.status, 'pending')))
      .returning();

    // Otra petición concurrente ya evaluó esta lectura: no se sobrescribe su resultado.
    if (!updated) {
      throw new AppHttpException(ErrorCode.READING_ALREADY_EVALUATED, { readingId: id });
    }

    await this.markFriendStreakCompletion(updated.id, userId);

    await this.users.recordDailyActivity(userId);
    await this.promptLogs.logPromptSuccess('reading_evaluated', userId, id, `eval:${id}`, {
      score: result.score,
      passed: result.passed,
      language: readingLanguage,
    });
    await this.auditLogs?.logUpdate({
      module: 'readings',
      event: 'reading.evaluated',
      entityType: 'readings',
      entityId: id,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Reading #${id} evaluated (score: ${result.score}, passed: ${String(result.passed)})`,
      beforeState: {
        id: reading.id,
        status: reading.status,
        score: reading.score,
        passed: reading.passed,
        userResponse: reading.userResponse,
        feedback: reading.feedback,
        updatedAt: reading.updatedAt,
      },
      afterState: {
        id: updated.id,
        status: updated.status,
        score: updated.score,
        passed: updated.passed,
        userResponse: updated.userResponse,
        feedback: updated.feedback,
        updatedAt: updated.updatedAt,
      },
    });

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

  /** Marca la respuesta privada del día y suma la racha solo cuando ambos terminaron. */
  private async markFriendStreakCompletion(readingId: number, userId: number): Promise<void> {
    if (readingId <= 0) return;
    if (typeof (this.db as unknown as { transaction?: unknown }).transaction !== 'function') return;
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(friendStreakDays)
        .where(
          or(
            eq(friendStreakDays.userLowReadingId, readingId),
            eq(friendStreakDays.userHighReadingId, readingId),
          ),
        );
      const current = rows[0];
      if (!current) return;
      const streakRows = await tx
        .select()
        .from(friendStreaks)
        .where(eq(friendStreaks.id, current.streakId));
      const currentStreak = streakRows[0];
      if (currentStreak?.status !== 'active') return;
      const today = getDateKeyInTimeZone('America/Mexico_City');
      if (current.streakDate !== today) return;
      const [day] = await tx
        .select()
        .from(friendStreakDays)
        .where(eq(friendStreakDays.id, current.id))
        .for('update');
      if (day?.status !== 'pending') return;
      const low = day.userLowReadingId === readingId || currentStreak.userLowId === userId;
      const patch = low ? { userLowCompletedAt: new Date() } : { userHighCompletedAt: new Date() };
      const [marked] = await tx
        .update(friendStreakDays)
        .set(patch)
        .where(
          and(
            eq(friendStreakDays.id, day.id),
            low
              ? isNull(friendStreakDays.userLowCompletedAt)
              : isNull(friendStreakDays.userHighCompletedAt),
          ),
        )
        .returning();
      if (!marked?.userLowCompletedAt || !marked.userHighCompletedAt) return;
      const [streak] = await tx
        .select()
        .from(friendStreaks)
        .where(eq(friendStreaks.id, currentStreak.id))
        .for('update');
      if (!streak) return;
      const next = streak.currentStreak + 1;
      await tx
        .update(friendStreaks)
        .set({
          currentStreak: next,
          longestStreak: Math.max(next, streak.longestStreak),
          lastCompletedDate: today,
          updatedAt: new Date(),
        })
        .where(eq(friendStreaks.id, streak.id));
      await tx
        .update(friendStreakDays)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(friendStreakDays.id, day.id));
    });
  }

  /**
   * Explica el significado contextual de una palabra u oración completa dentro de la lectura.
   * Reutiliza la caché persistida en PostgreSQL por lectura y término normalizado antes de
   * consumir cuota diaria o tokens de IA, salvo que `forceRefresh` sea verdadero.
   */
  async explain(
    id: number,
    userId: number,
    word: string,
    context?: string,
    forceRefresh = false,
    aiOptions?: AIRequestOptions,
  ): Promise<ExplanationResultDto> {
    await this.subscriptions.assertSubscriptionActive(userId);
    const reading = await this.findById(id, userId);

    const { displayWord, normalizedWord, entryType } = normalizeLookupTerm(word);
    if (!forceRefresh) {
      const cached = await this.findCachedExplanation(id, userId, normalizedWord);
      if (cached) {
        await this.auditLogs?.logEvent({
          module: 'readings',
          action: 'ACTION',
          event: 'reading.explanation_cache_hit',
          entityType: 'reading_explanations',
          entityId: cached.id,
          actorUserId: userId,
          targetUserId: userId,
          summary: `Cached explanation served for "${displayWord}" on reading #${id}`,
          metadata: { readingId: id, word: displayWord, normalizedWord, entryType },
        });
        return {
          id: cached.id,
          word: cached.word,
          entryType: cached.entryType,
          language: cached.language,
          difficulty: cached.difficulty,
          literalMeaning: cached.literalMeaning,
          explanation: cached.explanation,
          wordBreakdown: Array.isArray(cached.wordBreakdown) ? cached.wordBreakdown : [],
          otherWaysToSay: Array.isArray(cached.otherWaysToSay) ? cached.otherWaysToSay : [],
          otherContexts: Array.isArray(cached.otherContexts) ? cached.otherContexts : [],
          isSaved: Boolean(cached.isSaved),
          cached: true,
          reading,
        };
      }
    }

    await this.subscriptions.assertCanAskQuestion(userId);

    const rawLang = reading.language as string | undefined;
    const readingLanguage = (rawLang ?? 'en').toLowerCase();
    const readingLevel = (reading.difficulty as string | undefined) ?? 'medium';

    const { systemPrompt, userPrompt } =
      typeof this.promptGen.buildExplanationPrompt === 'function'
        ? this.promptGen.buildExplanationPrompt({
            word: displayWord,
            entryType,
            language: readingLanguage,
            difficulty: readingLevel,
            readingTitle: reading.title,
            readingContent: reading.content,
            context,
          })
        : buildFallbackExplanationPrompt(displayWord, readingLanguage, readingLevel, context);

    const structured = await this.executeWithPurityGuard({
      systemPrompt,
      userPrompt,
      targetLanguage: readingLanguage,
      ...(aiOptions !== undefined ? { aiOptions } : {}),
      parse: (raw) =>
        typeof this.parser.parseStructuredExplanation === 'function'
          ? this.parser.parseStructuredExplanation(raw, displayWord, entryType)
          : {
              literalMeaning: null,
              explanation: this.parser.parseExplanation(raw),
              wordBreakdown: [],
              otherWaysToSay: [],
              otherContexts: [],
            },
      extractTexts: (item) => [
        item.literalMeaning,
        item.explanation,
        ...item.otherWaysToSay.flatMap((alt) => [alt.register, alt.note]),
        ...item.otherContexts.flatMap((ctx) => [ctx.contextLabel, ctx.explanation, ctx.example]),
      ],
    });

    // La IA tarda segundos: otras explicaciones en paralelo pudieron consumir la cuota mientras tanto.
    // Se vuelve a validar con la fila del usuario bloqueada para que el INSERT sea atómico.
    const persisted = await this.db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for('no key update');
      await this.subscriptions.assertCanAskQuestion(userId, tx);
      return this.subscriptions.recordExplanation(
        {
          readingId: id,
          userId,
          word: displayWord,
          normalizedWord,
          entryType,
          language: readingLanguage,
          difficulty: readingLevel,
          context,
          literalMeaning: structured.literalMeaning,
          explanation: structured.explanation,
          wordBreakdown: structured.wordBreakdown,
          otherWaysToSay: structured.otherWaysToSay,
          otherContexts: structured.otherContexts,
        },
        tx,
      );
    });

    await this.promptLogs.logPromptSuccess('word_explained', userId, id, normalizedWord, {
      word: displayWord,
      entryType,
      language: readingLanguage,
      difficulty: readingLevel,
      forceRefresh,
    });

    await this.auditLogs?.logEvent({
      module: 'readings',
      action: 'AI',
      event: 'reading.explanation_generated',
      entityType: 'reading_explanations',
      entityId: persisted?.id ?? null,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Explanation generated for "${displayWord}" on reading #${id}`,
      afterState: {
        id: persisted?.id ?? null,
        readingId: id,
        word: displayWord,
        normalizedWord,
        entryType,
        language: readingLanguage,
        difficulty: readingLevel,
        isSaved: persisted?.isSaved ?? false,
      },
      metadata: { forceRefresh },
    });

    return {
      id: persisted?.id ?? null,
      word: displayWord,
      entryType,
      language: readingLanguage,
      difficulty: readingLevel,
      literalMeaning: structured.literalMeaning,
      explanation: structured.explanation,
      wordBreakdown: structured.wordBreakdown,
      otherWaysToSay: structured.otherWaysToSay,
      otherContexts: structured.otherContexts,
      isSaved: persisted?.isSaved ?? false,
      cached: false,
      reading,
    };
  }

  /**
   * Lista las consultas/explicaciones guardadas o generadas sobre una lectura específica del usuario.
   */
  async listReadingExplanations(readingId: number, userId: number): Promise<GlossaryEntryDto[]> {
    const reading = await this.findById(readingId, userId);
    const rows = await this.db
      .select()
      .from(readingExplanations)
      .where(
        and(eq(readingExplanations.readingId, readingId), eq(readingExplanations.userId, userId)),
      )
      .orderBy(desc(readingExplanations.createdAt), desc(readingExplanations.id));

    const seen = new Set<string>();
    const entries: GlossaryEntryDto[] = [];
    for (const row of rows) {
      const key = row.normalizedWord || row.word.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(toGlossaryEntryDto(row, reading.title, reading.deletedAt === null));
    }
    return entries;
  }

  /**
   * Consulta el glosario personal y el historial de ayudas contextuales del usuario autenticado.
   */
  async listGlossary(userId: number, query: GlossaryQueryDto): Promise<GlossaryEntryDto[]> {
    const conditions = [eq(readingExplanations.userId, userId)];

    if (query.entryType) {
      conditions.push(eq(readingExplanations.entryType, query.entryType));
    }
    if (query.language) {
      conditions.push(eq(readingExplanations.language, query.language));
    }
    if (query.readingId) {
      conditions.push(eq(readingExplanations.readingId, query.readingId));
    }
    if (query.savedOnly === true) {
      conditions.push(eq(readingExplanations.isSaved, true));
    }
    const trimmedSearch = query.search?.trim();
    if (trimmedSearch) {
      const pattern = `%${trimmedSearch}%`;
      const searchCondition = or(
        ilike(readingExplanations.word, pattern),
        ilike(readingExplanations.explanation, pattern),
        ilike(readingExplanations.context, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const rows = await this.db
      .select({
        entry: readingExplanations,
        readingTitle: readings.title,
        readingDeletedAt: readings.deletedAt,
      })
      .from(readingExplanations)
      .innerJoin(readings, eq(readingExplanations.readingId, readings.id))
      .where(and(...conditions))
      .orderBy(desc(readingExplanations.createdAt), desc(readingExplanations.id));

    return rows.map((row) =>
      toGlossaryEntryDto(row.entry, row.readingTitle, row.readingDeletedAt === null),
    );
  }

  /**
   * Marca o desmarca una explicación existente en el glosario personal sin eliminar el registro
   * histórico (necesario para auditar la cuota diaria).
   */
  async toggleGlossarySave(
    explanationId: number,
    userId: number,
    isSaved: boolean,
  ): Promise<GlossaryEntryDto> {
    let beforeSnapshot: Record<string, unknown> | null = null;
    if (this.auditLogs) {
      try {
        const existingRows = await this.db
          .select({
            id: readingExplanations.id,
            readingId: readingExplanations.readingId,
            word: readingExplanations.word,
            isSaved: readingExplanations.isSaved,
            savedAt: readingExplanations.savedAt,
            updatedAt: readingExplanations.updatedAt,
          })
          .from(readingExplanations)
          .where(
            and(eq(readingExplanations.id, explanationId), eq(readingExplanations.userId, userId)),
          )
          .limit(1);
        if (existingRows[0]) {
          beforeSnapshot = existingRows[0];
        }
      } catch {
        beforeSnapshot = null;
      }
    }

    const now = new Date();
    const updatedRows = await this.db
      .update(readingExplanations)
      .set({
        isSaved,
        savedAt: isSaved ? now : null,
        updatedAt: now,
      })
      .where(and(eq(readingExplanations.id, explanationId), eq(readingExplanations.userId, userId)))
      .returning();

    const updated = updatedRows[0] as ReadingExplanation | undefined;
    if (!updated) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, {
        resource: 'ReadingExplanation',
      });
    }

    await this.auditLogs?.logUpdate({
      module: 'readings',
      event: 'reading.glossary_toggled',
      entityType: 'reading_explanations',
      entityId: explanationId,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Glossary entry #${explanationId} ("${updated.word}") marked as ${isSaved ? 'saved' : 'unsaved'}`,
      beforeState: beforeSnapshot ?? {
        id: explanationId,
        readingId: updated.readingId,
        word: updated.word,
        isSaved: !isSaved,
      },
      afterState: {
        id: updated.id,
        readingId: updated.readingId,
        word: updated.word,
        isSaved: updated.isSaved,
        savedAt: updated.savedAt,
        updatedAt: updated.updatedAt,
      },
    });

    const readingRows = await this.db
      .select({ title: readings.title, deletedAt: readings.deletedAt })
      .from(readings)
      .where(eq(readings.id, updated.readingId))
      .limit(1);

    const readingRow = readingRows[0] as { title: string; deletedAt: Date | null } | undefined;
    return toGlossaryEntryDto(updated, readingRow?.title ?? '', readingRow?.deletedAt === null);
  }

  /** Busca una explicación previamente persistida para evitar llamadas redundantes a la IA. */
  private async findCachedExplanation(
    readingId: number,
    userId: number,
    normalizedWord: string,
  ): Promise<ReadingExplanation | null> {
    const rows = await this.db
      .select()
      .from(readingExplanations)
      .where(
        and(
          eq(readingExplanations.userId, userId),
          eq(readingExplanations.readingId, readingId),
          eq(readingExplanations.normalizedWord, normalizedWord),
        ),
      )
      .orderBy(desc(readingExplanations.createdAt), desc(readingExplanations.id))
      .limit(1);

    const candidate = rows[0] as ReadingExplanation | undefined;
    if (
      !candidate ||
      typeof candidate.explanation !== 'string' ||
      candidate.readingId !== readingId ||
      candidate.userId !== userId ||
      candidate.normalizedWord !== normalizedWord
    ) {
      return null;
    }
    return candidate;
  }

  /**
   * Marca una lectura como eliminada lógicamente (`deletedAt`) tras validar propiedad y vigencia.
   */
  async remove(id: number, userId: number): Promise<void> {
    const reading = await this.findById(id, userId);
    const deletedAt = new Date();
    await this.db
      .update(readings)
      .set({ deletedAt })
      .where(and(eq(readings.id, id), eq(readings.userId, userId)));

    await this.auditLogs?.logSoftDelete({
      module: 'readings',
      event: 'reading.soft_deleted',
      entityType: 'readings',
      entityId: id,
      actorUserId: userId,
      targetUserId: userId,
      summary: `Reading #${id} ("${reading.title}") soft-deleted by user #${userId}`,
      beforeState: {
        id: reading.id,
        userId: reading.userId,
        title: reading.title,
        description: reading.description,
        category: reading.category,
        difficulty: reading.difficulty,
        language: reading.language,
        status: reading.status,
        score: reading.score,
        deletedAt: null,
      },
      afterState: {
        id: reading.id,
        userId: reading.userId,
        title: reading.title,
        description: reading.description,
        category: reading.category,
        difficulty: reading.difficulty,
        language: reading.language,
        status: reading.status,
        score: reading.score,
        deletedAt,
      },
    });
  }

  /** Cuenta cuántas lecturas pendientes tiene actualmente el usuario. */
  private async getPendingCount(userId: number): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          eq(readings.status, 'pending'),
          eq(readings.originType, 'personal'),
          isNull(readings.deletedAt),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /** Cuenta lecturas pendientes directamente dentro del ejecutor o transacción recibido. */
  private async countPending(userId: number, dbClient: DrizzleExecutor): Promise<number> {
    const rows = await dbClient
      .select({ id: readings.id })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          eq(readings.status, 'pending'),
          eq(readings.originType, 'personal'),
          isNull(readings.deletedAt),
        ),
      );
    return rows.length;
  }

  /**
   * Recupera título y descripción de hasta las 10 lecturas activas más recientes del usuario en la categoría.
   */
  private async fetchRecentReadingSummaries(
    userId: number,
    rawCategory: string,
    trimmedCategory: string,
  ): Promise<RecentReadingSummary[]> {
    const escapedCategory = escapeLikePattern(trimmedCategory);
    const rows = await this.db
      .select({ title: readings.title, description: readings.description })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          or(eq(readings.category, rawCategory), ilike(readings.category, escapedCategory)),
          isNull(readings.deletedAt),
        ),
      )
      .orderBy(desc(readings.createdAt))
      .limit(RECENT_READINGS_LIMIT);

    return rows
      .map((row) => ({
        title: typeof row.title === 'string' ? row.title.trim() : '',
        description: typeof row.description === 'string' ? row.description.trim() : '',
      }))
      .filter((row) => row.title.length > 0);
  }

  /**
   * Genera dinámicamente un ángulo versátil para esta lectura concreta mediante IA y construye
   * el prompt final sin depender de un blueprint estático único por categoría.
   */
  private async buildDynamicReadingPrompt(options: {
    category: string;
    difficulty: DifficultyLevel;
    size: TextSize;
    language: string;
    recentReadings: readonly RecentReadingSummary[];
    usedLensIds: ReadonlySet<string>;
    rejectedAngles: readonly string[];
    aiOptions?: AIRequestOptions;
  }): Promise<{ prompt: GeneratedPrompt; lensId: string }> {
    const lens = pickExplorationLens(options.recentReadings, options.usedLensIds);
    const recentTitles = options.recentReadings.map((entry) => entry.title);
    const fallback = this.promptGen.buildFallbackEnrichedTopic(
      options.category,
      options.difficulty,
    );

    const enrichPrompt = this.promptGen.buildEnrichmentPrompt({
      category: options.category,
      difficulty: options.difficulty,
      language: options.language,
      recentTitles,
      recentReadings: options.recentReadings,
      lens,
      randomAngle: lens.guidance,
      ...(options.rejectedAngles.length > 0 ? { excludedAngles: options.rejectedAngles } : {}),
    });

    const enrichAiOptions: AIRequestOptions = {
      ...(options.aiOptions ?? {}),
      maxTokens: options.aiOptions?.maxTokens ?? 512,
      temperature: options.aiOptions?.temperature ?? 0.9,
      disableThinking: options.aiOptions?.disableThinking ?? true,
    };

    let enriched = fallback;
    try {
      const enrichRaw = await this.factory.getFullResponse(
        [
          { role: 'system', content: enrichPrompt.systemPrompt },
          { role: 'user', content: enrichPrompt.userPrompt },
        ],
        enrichAiOptions,
      );
      enriched = this.promptGen.parseEnrichmentResponse(enrichRaw, fallback);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Dynamic enrichment step fell back cleanly for "${options.category}": ${msg}`,
      );
      void this.errorLogs?.logError({
        severity: 'warn',
        source: 'ai_provider',
        module: 'readings',
        errorCode: 'READING_ENRICHMENT_FALLBACK',
        message: `Dynamic enrichment fell back for "${options.category}": ${msg}`,
        errorName: err instanceof Error ? err.name : typeof err,
        details: { category: options.category, language: options.language },
      });
    }

    const params: RandomPromptParams = this.promptGen.generateRandomParams({
      category: options.category,
      difficulty: options.difficulty,
      size: options.size,
      language: options.language,
      subcategories: [enriched.subtopic],
      uniqueFocusElement: enriched.uniqueFocusElement,
      keyConcepts: enriched.keyConcepts,
      editorialGuidance: lens.guidance,
      avoidTopics: recentTitles,
      ...(options.recentReadings.length > 0 ? { recentReadings: [...options.recentReadings] } : {}),
    });

    return {
      prompt: this.promptGen.buildPrompt(params),
      lensId: lens.id,
    };
  }

  /**
   * Evalúa mediante Google Decisions (`gemini-decision-1`) si el título y descripción de la nueva
   * lectura expresan esencialmente lo mismo que alguna de las últimas 10 lecturas del usuario.
   */
  private async evaluateSemanticRepetition(
    category: string,
    candidate: GeneratedText,
    recentReadings: readonly RecentReadingSummary[],
  ): Promise<{ repetitive: boolean; score: number }> {
    if (recentReadings.length === 0 || !this.googleDecisions?.isConfigured()) {
      return { repetitive: false, score: 0 };
    }

    const input = [
      `Category: ${JSON.stringify(category)}`,
      'NEW CANDIDATE READING:',
      `Title: ${JSON.stringify(candidate.title)}`,
      `Description: ${JSON.stringify(candidate.description)}`,
      '',
      `RECENT READINGS IN THIS CATEGORY (${recentReadings.length}):`,
      ...recentReadings.map((item, idx) =>
        item.description
          ? `${idx + 1}. Title: ${JSON.stringify(item.title)} | Description: ${JSON.stringify(item.description)}`
          : `${idx + 1}. Title: ${JSON.stringify(item.title)}`,
      ),
    ].join('\n');

    try {
      const result = await this.googleDecisions.score({
        input,
        instructions:
          'Evaluate whether the NEW CANDIDATE READING (title and description) expresses essentially the same core topic, historical narrative, thesis, or key examples as ANY of the listed RECENT READINGS in this category—even if phrased with different words. Ignore mere sharing of the broad category name.',
        criteria: [
          'Completely distinct angle, event, figure, work, or insight not covered in recent readings.',
          'Low overlap: only broad category background overlaps while the main thesis and examples are fresh.',
          'Moderate overlap: adjacent subtheme with noticeable framing differences and new takeaways.',
          'High semantic similarity: expresses essentially the same core explanation, origins, or thesis as one of the recent readings.',
          'Near duplicate: communicates virtually the exact same idea and message as a previous reading.',
        ],
      });

      return {
        repetitive: result.score >= SEMANTIC_SIMILARITY_REJECT_SCORE,
        score: result.score,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Google Decisions semantic similarity check failed (fail-open): ${msg}`);
      void this.errorLogs?.logError({
        severity: 'warn',
        source: 'ai_provider',
        module: 'readings',
        errorCode: 'SEMANTIC_DECISION_FALLBACK',
        message: `Google Decisions semantic similarity check failed: ${msg}`,
        errorName: err instanceof Error ? err.name : typeof err,
        details: { category },
      });
      return { repetitive: false, score: 0 };
    }
  }

  /**
   * Ejecuta una llamada de IA e inspecciona determinísticamente la pureza del idioma objetivo;
   * si detecta CJK, fugas de razonamiento o mezcla con inglés, reintenta respetando el proveedor activo.
   */
  private async executeWithPurityGuard<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    targetLanguage: string;
    aiOptions?: AIRequestOptions;
    parse: (raw: string) => T;
    extractTexts: (value: T) => (string | null | undefined)[];
    onPrimaryError?: (err: unknown) => never;
    onParseError?: (err: unknown) => Promise<never> | never;
  }): Promise<T> {
    const activeProvider: ProviderName =
      params.aiOptions?.provider ??
      (typeof this.factory.resolveProviderName === 'function'
        ? this.factory.resolveProviderName()
        : 'minimax');

    let rawPrimary: string;
    try {
      const primaryMessages = [
        { role: 'system' as const, content: params.systemPrompt },
        { role: 'user' as const, content: params.userPrompt },
      ];
      rawPrimary =
        params.aiOptions !== undefined
          ? await this.factory.getFullResponse(primaryMessages, params.aiOptions)
          : await this.factory.getFullResponse(primaryMessages);
    } catch (err) {
      if (params.onPrimaryError) {
        return params.onPrimaryError(err);
      }
      throw err;
    }

    let bestCandidate: { value: T; reasons: string[]; severity: number } | null = null;
    let lastParseError: unknown;

    try {
      const primaryResult = params.parse(rawPrimary);
      const primaryReport = inspectTextsPurity(
        params.extractTexts(primaryResult),
        params.targetLanguage,
      );
      if (primaryReport.clean) {
        return primaryResult;
      }
      bestCandidate = {
        value: primaryResult,
        reasons: primaryReport.reasons,
        severity: scorePuritySeverity(primaryReport.reasons),
      };
    } catch (parseErr) {
      lastParseError = parseErr;
    }

    const fallbackSequence = buildPurityFallbackSequence(activeProvider, params.aiOptions);
    for (const [idx, fallbackOptions] of fallbackSequence.entries()) {
      const reasons = bestCandidate ? bestCandidate.reasons : ['invalid_json_or_schema'];
      this.logger.warn(
        `Purity guard retry ${idx + 1}/${fallbackSequence.length} for ${params.targetLanguage} (${reasons.join(', ')}) via ${fallbackOptions.model ?? activeProvider}/${fallbackOptions.reasoningEffort ?? 'default'}`,
      );
      const correction = buildPurityCorrectionNote(params.targetLanguage, reasons);

      try {
        const retryRaw = await this.factory.getFullResponse(
          [
            { role: 'system', content: `${params.systemPrompt}\n${correction}` },
            { role: 'user', content: `${params.userPrompt}\n${correction}` },
          ],
          fallbackOptions,
        );
        const retryResult = params.parse(retryRaw);
        const retryReport = inspectTextsPurity(
          params.extractTexts(retryResult),
          params.targetLanguage,
        );
        if (retryReport.clean) {
          return retryResult;
        }
        const retrySeverity = scorePuritySeverity(retryReport.reasons);
        if (!bestCandidate || retrySeverity < bestCandidate.severity) {
          bestCandidate = {
            value: retryResult,
            reasons: retryReport.reasons,
            severity: retrySeverity,
          };
        }
      } catch (err) {
        lastParseError = err;
        this.logger.warn(
          `Purity guard retry ${idx + 1} failed (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }

    if (bestCandidate) {
      return bestCandidate.value;
    }
    if (params.onParseError) {
      return params.onParseError(lastParseError);
    }
    throw lastParseError instanceof Error ? lastParseError : new Error(String(lastParseError));
  }
}

/** Escapa comodines de `LIKE` para que una búsqueda trate el término como texto literal. */
function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, '\\$&');
}

/** Limpia una selección léxica y la clasifica como palabra o frase para consultar el glosario. */
function normalizeLookupTerm(rawWord: string): {
  displayWord: string;
  normalizedWord: string;
  entryType: ExplanationEntryType;
} {
  const displayWord = rawWord.trim().replace(/\s+/g, ' ');
  if (!displayWord) {
    throw new AppHttpException(ErrorCode.VALIDATION_ERROR, {
      field: 'word',
      reason: 'Selected word or phrase must not be empty',
    });
  }
  const normalizedWord = displayWord.toLowerCase();
  const entryType: ExplanationEntryType = normalizedWord.includes(' ') ? 'phrase' : 'word';
  return { displayWord, normalizedWord, entryType };
}

/** Construye un prompt mínimo de respaldo cuando no está disponible el generador principal. */
function buildFallbackExplanationPrompt(
  word: string,
  language: string,
  difficulty: string,
  context?: string,
): { systemPrompt: string; userPrompt: string } {
  const langLabel = LANGUAGE_NAMES[language.toLowerCase()] ?? 'English';
  const systemPrompt = `You are a ${langLabel} vocabulary explainer for language learners (target level: ${difficulty}).
Respond ONLY with a valid JSON object strictly in natural ${langLabel}.`;
  const userPrompt = context
    ? `Explain "${word}" in ${langLabel} within context: "${context}".`
    : `Explain "${word}" in ${langLabel}.`;
  return { systemPrompt, userPrompt };
}

/** Proyecta una explicación persistida al DTO del glosario con valores opcionales normalizados. */
function toGlossaryEntryDto(
  row: ReadingExplanation,
  readingTitle: string,
  readingAvailable: boolean,
): GlossaryEntryDto {
  return {
    id: row.id,
    readingId: row.readingId,
    readingTitle,
    readingAvailable,
    word: row.word,
    normalizedWord: row.normalizedWord,
    entryType: row.entryType,
    language: row.language,
    difficulty: row.difficulty,
    context: row.context ?? null,
    literalMeaning: row.literalMeaning ?? null,
    explanation: row.explanation,
    wordBreakdown: Array.isArray(row.wordBreakdown) ? row.wordBreakdown : [],
    otherWaysToSay: Array.isArray(row.otherWaysToSay) ? row.otherWaysToSay : [],
    otherContexts: Array.isArray(row.otherContexts) ? row.otherContexts : [],
    isSaved: Boolean(row.isSaved),
    savedAt: row.savedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
