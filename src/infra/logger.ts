export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MAX_STRING_LENGTH = 500;

/**
 * Truncates long strings before logging. Defense-in-depth: the server never
 * passes card/note content to the logger, and this guard limits accidental
 * leakage of payload previews into structured logs.
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/(secret|token|password|api_?key|authorization)/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = sanitize(item, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(
  level: LogLevel,
  sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const minLevel = LEVEL_ORDER[level];

  const make = (bindings: Record<string, unknown>): Logger => {
    const emit = (levelName: LogLevel, message: string, fields?: Record<string, unknown>): void => {
      if (LEVEL_ORDER[levelName] < minLevel) return;
      const record = {
        ts: new Date().toISOString(),
        level: levelName,
        msg: message,
        ...(sanitize({ ...bindings, ...fields }) as Record<string, unknown>),
      };
      sink(JSON.stringify(record));
    };
    return {
      debug: (message, fields) => emit('debug', message, fields),
      info: (message, fields) => emit('info', message, fields),
      warn: (message, fields) => emit('warn', message, fields),
      error: (message, fields) => emit('error', message, fields),
      child: (extra) => make({ ...bindings, ...extra }),
    };
  };

  return make({});
}
