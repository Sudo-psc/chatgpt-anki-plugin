import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AnkiConnectError,
  AnkiConflictError,
  AnkiNotFoundError,
  AnkiTransportError,
} from '../../src/anki/errors.js';
import { toErrorPayload } from '../../src/tools/errors.js';
import { ToolError, ToolErrors } from '../../src/tools/types.js';

describe('toErrorPayload', () => {
  it('maps ToolError with code, message and hint', () => {
    const payload = toErrorPayload(ToolErrors.validation('bad input', 'fix it'));
    expect(payload).toEqual({ code: 'VALIDATION_ERROR', message: 'bad input', hint: 'fix it' });
  });

  it('maps not-found with a discovery hint', () => {
    const payload = toErrorPayload(new AnkiNotFoundError('Deck "X" does not exist.'));
    expect(payload.code).toBe('NOT_FOUND');
    expect(payload.hint).toMatch(/list_decks|search_cards/);
  });

  it('maps conflicts', () => {
    expect(toErrorPayload(new AnkiConflictError('already exists')).code).toBe('CONFLICT');
  });

  it('maps transport errors to ANKI_UNAVAILABLE with remediation', () => {
    const payload = toErrorPayload(new AnkiTransportError('unreachable'));
    expect(payload.code).toBe('ANKI_UNAVAILABLE');
    expect(payload.hint).toMatch(/Anki Desktop/);
  });

  it('maps AnkiConnect errors and special-cases unsupported answerCards', () => {
    const generic = toErrorPayload(new AnkiConnectError('boom', 'findCards'));
    expect(generic.code).toBe('ANKI_ERROR');
    expect(generic.message).toContain('findCards');

    const unsupported = toErrorPayload(new AnkiConnectError('unsupported action', 'answerCards'));
    expect(unsupported.hint).toMatch(/Update the AnkiConnect add-on/);
  });

  it('maps ZodError to VALIDATION_ERROR with field paths', () => {
    const schema = z.object({ name: z.string() });
    const parsed = schema.safeParse({ name: 42 });
    if (parsed.success) throw new Error('expected failure');
    const payload = toErrorPayload(parsed.error);
    expect(payload.code).toBe('VALIDATION_ERROR');
    expect(payload.message).toContain('name');
  });

  it('maps unknown errors to INTERNAL without leaking details', () => {
    const payload = toErrorPayload(new Error('secret internal detail'));
    expect(payload.code).toBe('INTERNAL');
    expect(payload.message).not.toContain('secret internal detail');
  });

  it('forbidden errors explain the missing scope', () => {
    const payload = toErrorPayload(ToolErrors.forbidden('anki:admin'));
    expect(payload.code).toBe('FORBIDDEN');
    expect(payload.message).toContain('anki:admin');
    expect(payload.hint).toMatch(/Re-authorize/);
  });

  it('ToolError carries its code property', () => {
    const error = new ToolError('RATE_LIMITED', 'slow down');
    expect(error.code).toBe('RATE_LIMITED');
  });
});
