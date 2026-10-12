/**
 * Parse streamed LLM output that may include a `<think>...</think>` reasoning block.
 *
 * Models like MiniMax M3, o1, DeepSeek-R1, and Claude with extended thinking all emit
 * their reasoning inside a `<think>` block before the user-visible answer. The
 * downstream parsers (JSON for readings, raw text for chat) need ONLY the answer.
 *
 * The parser is stateful across chunks. Always pair every consume() with a flush()
 * after the stream ends.
 */
export type ParserEvent = { type: 'text'; value: string };

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const HOLD_LEN = OPEN_TAG.length;

export class ThinkBlockParser {
  private buffer = '';
  private inThink = false;

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
