/**
 * Utilidades compartidas para interpretar respuestas JSON emitidas por modelos de IA.
 *
 * Los providers no siempre devuelven JSON valido: en el Free Tier de Gemini es
 * frecuente que el modelo use comillas tipograficas (`« »`, `“ ”`) como
 * delimitadores de cadena en lugar de las comillas dobles ASCII, lo que hace
 * que `JSON.parse` falle con `Unexpected token '«'`.
 *
 * La normalizacion convierte esos delimitadores en cadenas JSON correctas
 * **sin tocar** los que aparecen dentro de una cadena ya valida (una cita
 * francesa dentro del texto, por ejemplo), porque el recorrido solo repara
 * delimitadores que aparecen fuera de una cadena.
 */

/** Pares de delimitadores tipograficos soportados, en orden de apertura. */
const SMART_QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['«', '»'],
  ['“', '”'],
];

/**
 * Escapa el cuerpo de una cadena JSON: comillas dobles, saltos de linea,
 * tabuladores y demas caracteres de control.
 *
 * Las comillas ya escapadas (`\"`) se respetan: solo se escapan las comillas
 * que no estan precedidas por una barra impar.
 */
function escapeJsonStringBody(value: string): string {
  let out = '';
  let backslashes = 0;

  for (const ch of value) {
    if (ch === '"' && backslashes % 2 === 0) {
      out += '\\';
    }

    if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\r') {
      out += '\\r';
    } else if (ch === '\t') {
      out += '\\t';
    } else {
      const code = ch.charCodeAt(0);
      out += code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : ch;
    }

    backslashes = ch === '\\' ? backslashes + 1 : 0;
  }

  return out;
}

/**
 * Busca el cierre del delimitador tipografico abierto en `text`, desde `from`.
 * Cuenta anidamientos del mismo tipo (las comillas angulares se anidan en la
 * tipografia francesa) y devuelve -1 si no hay cierre.
 */
function findSmartQuoteEnd(text: string, from: number, opening: string, closing: string): number {
  let depth = 1;

  for (let i = from + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === opening) {
      depth += 1;
      continue;
    }
    if (ch === closing) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Normaliza los delimitadores de cadena tipograficos (`« »`, `“ ”`) que el
 * modelo usa en lugar de las comillas dobles ASCII.
 *
 * - Fuera de una cadena JSON, un par `« ... »` se convierte en una cadena JSON
 *   valida (con su contenido escapado).
 * - Dentro de una cadena JSON valida, los caracteres se conservan intactos: una
 *   cita francesa dentro del texto generado no se toca.
 */
export function normalizeSmartQuoteStrings(text: string): string {
  if (!text.includes('«') && !text.includes('“')) {
    return text;
  }

  let out = '';
  let i = 0;
  let inString = false;
  let escape = false;

  while (i < text.length) {
    const ch = text[i] ?? '';

    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    const pair = SMART_QUOTE_PAIRS.find(([opening]) => opening === ch);
    if (pair) {
      const [opening, closing] = pair;
      const end = findSmartQuoteEnd(text, i, opening, closing);
      if (end !== -1) {
        out += `"${escapeJsonStringBody(text.slice(i + 1, end))}"`;
        i = end + 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}
