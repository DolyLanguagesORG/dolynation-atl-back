import { Inject, Injectable } from '@nestjs/common';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AIProviderFactory } from '../ia/providers/ai-provider.factory';
import { PromptBuilderService, READING_CATEGORIES } from './prompt-generation';
import type { DifficultyLevel, RandomPromptParams } from './prompt-generation/catalog.types';
import {
  AiResponseParserService,
  type GeneratedText,
  type EvaluationResult,
} from './ai-response-parser.service';
import { PromptLogService } from './prompt-logs';
import { UsersService } from '../users/users.service';
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

const MAX_PENDING = 3;

@Injectable()
export class ReadingsService {
  constructor(
    private readonly factory: AIProviderFactory,
    private readonly promptGen: PromptBuilderService,
    private readonly parser: AiResponseParserService,
    private readonly promptLogs: PromptLogService,
    private readonly users: UsersService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async generate(input: { userId: number; options: GenerateReadingDto }): Promise<Reading> {
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'User' });
    }

    const pendingCount = await this.getPendingCount(input.userId);
    if (pendingCount >= MAX_PENDING) {
      throw new AppHttpException(ErrorCode.READING_PENDING_LIMIT_REACHED, { max: MAX_PENDING });
    }

    // The client controls 3 explicit fields (category, difficulty, size).
    // The system picks the rest — subcategory focus, content type, perspective
    // and unique angle — so the LLM gets a non-trivial composition every time.
    const params: RandomPromptParams = this.promptGen.generateRandomParams({
      category: input.options.category,
      difficulty: input.options.difficulty ?? 'medium',
      size: input.options.size ?? 'medium',
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
      parsed = this.parser.parseGeneratedText(rawResponse);
    } catch (err) {
      await this.promptLogs.logPromptError(
        'text_generation_failed',
        input.userId,
        (err as Error).message,
        prompt.seed,
      );
      throw new AppHttpException(ErrorCode.SERVICE_UNAVAILABLE, { operation: 'ai_parse' });
    }

    // Enforce the requested difficulty. The system prompt tells the LLM
    // the output "difficulty" field MUST be the requested one, but if the
    // model ignores that and returns a different level, we override it
    // before persisting so the database stays in sync with the user's
    // request.
    const requestedDifficulty: DifficultyLevel = input.options.difficulty ?? 'medium';
    if (parsed.difficulty !== requestedDifficulty) {
      const previousDifficulty = parsed.difficulty;
      parsed = { ...parsed, difficulty: requestedDifficulty };
      // Don't bail — log and continue.
      // eslint-disable-next-line no-console
      console.warn('Difficulty mismatch between prompt and AI response', {
        userId: input.userId,
        requestedDifficulty,
        aiReturnedDifficulty: previousDifficulty,
        seed: prompt.seed,
      });
    }

    // Normalise the category too: the LLM should echo one of the documented
    // values. If it picks something off-list, fall back to what the user
    // requested so the reading stays in scope.
    const allowedCategories = new Set<string>(READING_CATEGORIES);
    if (!allowedCategories.has(parsed.category)) {
      parsed = { ...parsed, category: input.options.category };
    }

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
      },
    );
    return inserted;
  }

  async findById(id: number, userId: number): Promise<Reading> {
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

  async listPending(userId: number): Promise<Reading[]> {
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

  async listCompleted(userId: number): Promise<Reading[]> {
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
   * Returns the static configuration the UI needs to populate its
   * category/difficulty/size pickers. Backed by the prompt-generator's
   * service-side catalogue so the UI can never offer a value that the
   * backend can't render.
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
    // Spread the DB row last so anything the column write pinned (userResponse,
    // feedback, updatedAt, status='completed') overrides matching keys.
    return {
      score: result.score,
      passed: result.passed,
      feedback: result.feedback,
      userResponse: dto.userResponse,
      reading: updated,
    };
  }

  async explain(
    id: number,
    userId: number,
    word: string,
    context?: string,
  ): Promise<{ explanation: string; reading: Reading }> {
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
    return { explanation, reading };
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.findById(id, userId);
    await this.db
      .update(readings)
      .set({ deletedAt: new Date() })
      .where(and(eq(readings.id, id), eq(readings.userId, userId)));
  }

  private async getPendingCount(userId: number): Promise<number> {
    const pending = await this.listPending(userId);
    return pending.length;
  }
}
