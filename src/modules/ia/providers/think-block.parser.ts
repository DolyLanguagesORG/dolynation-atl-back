/**
 * Parsea la salida en streaming de un LLM cuando incluye un bloque de razonamiento `<think>...</think>`.
 *
 * Modelos como MiniMax M3, o1, DeepSeek-R1 y Claude con pensamiento extendido emiten primero su
 * razonamiento dentro de `<think>` antes de la respuesta visible al usuario. Los parsers posteriores
 * (JSON para lecturas, texto plano para chat) necesitan únicamente la respuesta final.
 *
 * El parser mantiene estado entre fragmentos; debe llamarse siempre a `flush()` tras terminar el stream.
 */
export type ParserEvent = { type: 'text'; value: string };

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const HOLD_LEN = OPEN_TAG.length;

/**
 * Máquina de estados incremental para descartar etiquetas `<think>...</think>` incluso si llegan partidas entre chunks.
 */
export class ThinkBlockParser {
  private buffer = '';
  private inThink = false;

  /**
   * Consume un fragmento de texto recibido del stream y emite solo texto visible confirmado.
   */
  consume(chunk: string): ParserEvent[] {
    this.buffer += chunk;
    const events: ParserEvent[] = [];

    while (true) {
      if (!this.inThink) {
        const openIdx = this.buffer.indexOf(OPEN_TAG);
        if (openIdx === -1) {
          const hold = Math.min(HOLD_LEN, this.buffer.length);
          const safeLen = this.buffer.length - hold;
          if (safeLen > 0) {
            events.push({ type: 'text', value: this.buffer.slice(0, safeLen) });
            this.buffer = this.buffer.slice(safeLen);
          }
          return events;
        }
        if (openIdx > 0) {
          events.push({ type: 'text', value: this.buffer.slice(0, openIdx) });
        }
        this.buffer = this.buffer.slice(openIdx + OPEN_TAG.length);
        this.inThink = true;
      }

      const closeIdx = this.buffer.indexOf(CLOSE_TAG);
      if (closeIdx === -1) {
        return events;
      }

      const after = this.buffer.slice(closeIdx + CLOSE_TAG.length);
      const trimmed = after.replace(/^\s+/, '');
      this.buffer = '';
      this.inThink = false;
      if (trimmed.length > 0) {
        events.push({ type: 'text', value: trimmed });
      }
      return events;
    }
  }

  /**
   * Vacía el búfer restante al finalizar el stream si no quedó dentro de un bloque `<think>` abierto.
   */
  flush(): ParserEvent[] {
    if (this.inThink) {
      this.buffer = '';
      this.inThink = false;
      return [];
    }
    const remaining = this.buffer;
    this.buffer = '';
    if (remaining.length === 0) return [];
    return [{ type: 'text', value: remaining.replace(/^\s+/, '') }];
  }
}
