import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import type { DrizzleDb } from '../../database/database.module';
import { readingExplanations, readings } from '../../database/drizzle/schema';
import type {
  HistoryReadingsSummaryDto,
  HistoryScoreEntryDto,
  HistorySummaryDto,
} from './dto/history-summary.dto';

/** Límite predeterminado de calificaciones recientes devueltas por consulta. */
const RECENT_LIMIT = 10;

/**
 * Servicio encargado de calcular el historial agregado y las calificaciones recientes del usuario.
 */
@Injectable()
export class HistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Obtiene el resumen completo de actividad del usuario en paralelo.
   */
  async getSummary(userId: number): Promise<HistorySummaryDto> {
    const [readingsSummary, recentScores, wordsLookedUp] = await Promise.all([
      this.readingsSummaryFor(userId),
      this.recentScoresFor(userId),
      this.wordsLookedUpFor(userId),
    ]);

    return {
      readings: readingsSummary,
      recentScores,
      wordsLookedUp,
    };
  }

  /**
   * Cuenta el total histórico de explicaciones y consultas de vocabulario realizadas por el usuario.
   */
  private async wordsLookedUpFor(userId: number): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(readingExplanations)
      .where(eq(readingExplanations.userId, userId));

    return rows[0]?.count ?? 0;
  }

  /**
   * Calcula totales de lecturas (pendientes, completadas, aprobadas y promedio) del usuario.
   */
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

  /**
   * Consulta las lecturas completadas más recientes junto con su puntaje y fecha de evaluación.
   */
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
