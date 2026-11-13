import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.tokens';
import { authEmailTokens } from '../../database/drizzle/schema';
import type { DrizzleDb } from '../../database/database.module';
import type { EmailTokenType } from '../mail/mail.constants';

/** Resultado de consumir un token de correo correctamente. */
export interface ConsumedEmailToken {
  /** Usuario propietario del token. */
  userId: number;
}

/**
 * Gestiona el ciclo de vida de los tokens de correo (confirmación de cuenta y
 * restablecimiento de contraseña).
 *
 * Los tokens se generan con 32 bytes aleatorios y **solo se persiste su hash
 * SHA-256**: el valor en claro viaja únicamente dentro del enlace del correo.
 * Por eso el token no se puede recuperar de la base de datos, solo validar.
 *
 * SHA-256 es adecuado aquí porque el token tiene 256 bits de entropía; para las
 * contraseñas, que son de baja entropía, el proyecto usa Argon2id (ver
 * `docs/conventions/security.md`).
 */
@Injectable()
export class AuthEmailTokenService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Emite un token nuevo para un usuario y revoca los del mismo tipo que
   * siguieran activos.
   *
   * @returns El token **en claro**: es lo único que se envía por correo.
   */
  async issue(input: {
    userId: number;
    type: EmailTokenType;
    ttlMinutes: number;
  }): Promise<string> {
    const now = new Date();

    // Como máximo queda un token vigente por tipo y usuario: pedir un nuevo
    // correo invalida el anterior.
    await this.revokeActive(input.userId, input.type);

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(token);
    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000);

    await this.db.insert(authEmailTokens).values({
      userId: input.userId,
      type: input.type,
      tokenHash,
      expiresAt,
      createdAt: now,
    });

    return token;
  }

  /**
   * Consume un token: comprueba que exista, que no esté expirado y que no se
   * haya usado antes, y lo marca como consumido **de forma atómica**.
   *
   * @returns El usuario propietario del token, o `null` si el token no es válido.
   */
  async consume(token: string, type: EmailTokenType): Promise<ConsumedEmailToken | null> {
    const now = new Date();
    const tokenHash = this.hash(token);

    const [stored] = await this.db
      .select()
      .from(authEmailTokens)
      .where(
        and(
          eq(authEmailTokens.tokenHash, tokenHash),
          eq(authEmailTokens.type, type),
          isNull(authEmailTokens.consumedAt),
          gt(authEmailTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (!stored) {
      return null;
    }

    // Consumo atómico: la condición `consumed_at IS NULL` garantiza que solo
    // una petición concurrente puede marking el token como usado.
    const [consumed] = await this.db
      .update(authEmailTokens)
      .set({ consumedAt: now })
      .where(and(eq(authEmailTokens.id, stored.id), isNull(authEmailTokens.consumedAt)))
      .returning({ id: authEmailTokens.id });

    if (!consumed) {
      return null;
    }

    return { userId: stored.userId };
  }

  /** Revoca todos los tokens activos de un tipo para un usuario. */
  async revokeActive(userId: number, type: EmailTokenType): Promise<void> {
    await this.db
      .update(authEmailTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(authEmailTokens.userId, userId),
          eq(authEmailTokens.type, type),
          isNull(authEmailTokens.consumedAt),
        ),
      );
  }

  /** Calcula el hash SHA-256 en hexadecimal con el que se persiste el token. */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
