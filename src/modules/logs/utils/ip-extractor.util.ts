const MAX_IP_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 1000;
const MAX_COUNTRY_LENGTH = 16;

/** Forma mínima de una petición HTTP compatible con Express y mocks de pruebas. */
export interface HttpRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string | undefined;
  socket?: { remoteAddress?: string | undefined } | undefined;
}

function readHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === 'string' && first.trim().length > 0) {
        return first.trim();
      }
    }
  }
  return null;
}

/**
 * Normaliza una cadena de IP eliminando listas separadas por comas, prefijos IPv4-mapped IPv6
 * (`::ffff:`) y puertos adjuntos en direcciones IPv4.
 */
export function normalizeIpAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const firstToken = raw
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!firstToken) return null;

  let cleaned = firstToken.replace(/^"+|"+$/g, '').trim();
  if (cleaned.toLowerCase().startsWith('::ffff:')) {
    cleaned = cleaned.slice(7);
  }

  // Elimina sufijo `:puerto` en IPv4 (ej. `203.0.113.5:54321`)
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(cleaned);
  if (ipv4WithPort?.[1]) {
    cleaned = ipv4WithPort[1];
  }

  // Elimina corchetes en IPv6 `[2001:db8::1]:443`
  const bracketedIpv6 = /^\[([^\]]+)\](?::\d+)?$/.exec(cleaned);
  if (bracketedIpv6?.[1]) {
    cleaned = bracketedIpv6[1];
  }

  const bounded = cleaned.slice(0, MAX_IP_LENGTH).trim();
  return bounded.length > 0 ? bounded : null;
}

/**
 * Extrae la IP real del cliente priorizando cabeceras de Cloudflare y Nginx Proxy:
 * `CF-Connecting-IP` > `X-Real-IP` > `X-Forwarded-For` > `req.ip` > `req.socket.remoteAddress`.
 */
export function extractClientIp(req: HttpRequestLike | undefined): string | null {
  if (!req) return null;

  const candidates = [
    readHeaderValue(req.headers, 'cf-connecting-ip'),
    readHeaderValue(req.headers, 'x-real-ip'),
    readHeaderValue(req.headers, 'x-forwarded-for'),
    req.ip,
    req.socket?.remoteAddress,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIpAddress(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/** Extrae y acota la cabecera `User-Agent` de la petición entrante. */
export function extractUserAgent(req: HttpRequestLike | undefined): string | null {
  if (!req) return null;
  const raw = readHeaderValue(req.headers, 'user-agent');
  if (!raw) return null;
  return raw.slice(0, MAX_USER_AGENT_LENGTH);
}

/** Extrae el código de país de origen cuando Cloudflare inyecta `CF-IPCountry`. */
export function extractCountryCode(req: HttpRequestLike | undefined): string | null {
  if (!req) return null;
  const raw = readHeaderValue(req.headers, 'cf-ipcountry');
  if (!raw) return null;
  return raw.slice(0, MAX_COUNTRY_LENGTH);
}
