import pino from 'pino';

/**
 * Structured stderr-only logger.
 * Invariant: NEVER write logs to stdout (stdio MCP transport uses stdout)
 * and NEVER log flashcard content, fields, tags, or secrets.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'headers.authorization',
  'authorization',
  'token',
  'access_token',
  'refresh_token',
  'code_verifier',
  'pin',
  'fields',
  'fields.*',
  'note.fields',
  'Front',
  'Back',
  'tags',
];

export const logger = pino(
  {
    name: 'chatgpt-anki-plugin',
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(2), // fd 2 = stderr
);
