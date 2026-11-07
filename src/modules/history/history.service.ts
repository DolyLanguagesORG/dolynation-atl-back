import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { readings } from '../../database/drizzle/schema';
import type {
  HistoryReadingsSummaryDto,
  HistoryScoreEntryDto,
  HistorySummaryDto,
} from './dto/history-summary.dto';

const RECENT_LIMIT = 10;

@Injectable()
export class HistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getSummary(userId: number): Promise<HistorySummaryDto> {
    const [readingsSummary, recentScores] = await Promise.all([
      this.readingsSummaryFor(userId),
      this.recentScoresFor(userId),
    ]);

    return {
      readings: readingsSummary,
      recentScores,
      // Word lookups are not persisted yet; keep the field so the frontend can
      // bind to it without a schema change once the lookup table is added.
      wordsLookedUp: 0,
    };
  }

  private async readingsSummaryFor(userId: number): Promise<HistoryReadingsSummaryDto> {
    const rows = await this.db
      .select({
        id: readings.id,
        status: readings.status,
        score: readings.score,
        passed: readings.passed,
      })
      .from(readings)
      .where(and(eq(readings.userId, userId), isNull(readings.deletedAt)));

    const total = rows.length;
    const completedRows = rows.filter((r) => r.status === 'completed');
    const completed = completedRows.length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const passed = completedRows.filter((r) => r.passed === true).length;

    const scored = completedRows
      .map((r) => r.score)
      .filter((s): s is number => typeof s === 'number');
    const averageScore =
      scored.length === 0 ? null : Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);

    return { total, pending, completed, passed, averageScore };
  }

  async recentScoresFor(userId: number, limit = RECENT_LIMIT): Promise<HistoryScoreEntryDto[]> {
    const rows = await this.db
      .select({
        id: readings.id,
        title: readings.title,
        score: readings.score,
        passed: readings.passed,
        updatedAt: readings.updatedAt,
      })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          eq(readings.status, 'completed'),
          isNull(readings.deletedAt),
        ),
      )
      .orderBy(desc(readings.updatedAt))
      .limit(limit);

    return rows.map((r) => ({
      readingId: r.id,
      title: r.title,
      score: r.score,
      passed: r.passed,
      evaluatedAt: r.updatedAt,
    }));
  }
}
