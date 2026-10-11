import type { Logger } from './logger.js';

/**
 * Minimal tracing abstraction. Every operation that talks to AnkiConnect or
 * handles a tool call is wrapped in a span so an OpenTelemetry exporter can be
 * plugged in later without touching call sites (see docs/08-runbook-operacional.md).
 */
export async function withSpan<T>(
  name: string,
  attrs: Record<string, unknown>,
  logger: Logger,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    logger.debug('span', { span: name, ms: Date.now() - startedAt, ok: true, ...attrs });
    return result;
  } catch (error) {
    logger.debug('span', {
      span: name,
      ms: Date.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ...attrs,
    });
    throw error;
  }
}
