import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/infra/logger.js';

function capture(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (line) => lines.push(line) };
}

describe('createLogger', () => {
  it('filters by level', () => {
    const { lines, sink } = capture();
    const logger = createLogger('warn', sink);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string).msg).toBe('w');
  });

  it('emits structured JSON with timestamp, level and message', () => {
    const { lines, sink } = capture();
    const logger = createLogger('debug', sink);
    logger.info('hello', { tool: 'list_decks' });
    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(record.level).toBe('info');
    expect(record.msg).toBe('hello');
    expect(record.tool).toBe('list_decks');
    expect(typeof record.ts).toBe('string');
  });

  it('redacts secret-looking keys', () => {
    const { lines, sink } = capture();
    const logger = createLogger('debug', sink);
    logger.info('req', { authorization: 'Bearer abc', token: 'xyz', api_key: 'k', secret: 's', nested: { password: 'p' } });
    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(record.authorization).toBe('[redacted]');
    expect(record.token).toBe('[redacted]');
    expect(record.api_key).toBe('[redacted]');
    expect(record.secret).toBe('[redacted]');
    expect((record.nested as Record<string, unknown>).password).toBe('[redacted]');
  });

  it('truncates long strings to limit accidental payload leakage', () => {
    const { lines, sink } = capture();
    const logger = createLogger('debug', sink);
    logger.info('big', { preview: 'x'.repeat(2000) });
    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    const preview = String(record.preview);
    expect(preview.length).toBeLessThan(2000);
    expect(preview.endsWith('…[truncated]')).toBe(true);
  });

  it('child loggers merge bindings', () => {
    const { lines, sink } = capture();
    const logger = createLogger('debug', sink).child({ service: 'mcp' });
    logger.child({ tool: 'x' }).info('m');
    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(record.service).toBe('mcp');
    expect(record.tool).toBe('x');
  });
});
