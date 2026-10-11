import { ZodError } from 'zod';
import {
  AnkiConnectError,
  AnkiConflictError,
  AnkiError,
  AnkiNotFoundError,
  AnkiTransportError,
} from '../anki/errors.js';
import { ToolError, type ErrorPayload } from './types.js';

/**
 * Converts any thrown error into the documented, typed tool error payload.
 * Codes and hints are part of the public contract (docs/05-tools-mcp.md).
 */
export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof ToolError) {
    return { code: error.code, message: error.message, hint: error.hint };
  }
  if (error instanceof AnkiNotFoundError) {
    return {
      code: 'NOT_FOUND',
      message: error.message,
      hint: 'Use list_decks / search_cards to discover valid identifiers.',
    };
  }
  if (error instanceof AnkiConflictError) {
    return {
      code: 'CONFLICT',
      message: error.message,
      hint: 'Adjust the request to match the current collection state and retry.',
    };
  }
  if (error instanceof AnkiTransportError) {
    return {
      code: 'ANKI_UNAVAILABLE',
      message: error.message,
      hint: 'Ensure Anki Desktop is running with the AnkiConnect add-on reachable, then retry.',
    };
  }
  if (error instanceof AnkiConnectError) {
    const hint =
      error.action === 'answerCards' && /unsupported action/i.test(error.message)
        ? 'Update the AnkiConnect add-on to a recent version that supports the "answerCards" action (needed by submit_review).'
        : 'Check the collection state and retry; if this persists, inspect the AnkiConnect error message.';
    return {
      code: 'ANKI_ERROR',
      message: `AnkiConnect error on "${error.action}": ${error.message}`,
      hint,
    };
  }
  if (error instanceof ZodError) {
    const details = error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      code: 'VALIDATION_ERROR',
      message: `Invalid input: ${details}`,
      hint: 'Fix the listed fields and retry.',
    };
  }
  if (error instanceof AnkiError) {
    return { code: 'ANKI_ERROR', message: error.message };
  }
  return {
    code: 'INTERNAL',
    message: 'Unexpected internal error.',
    hint: 'Retry the request; if the problem persists, inspect the server logs for details.',
  };
}
