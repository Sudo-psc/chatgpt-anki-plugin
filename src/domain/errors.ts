/**
 * Typed domain errors with actionable hints for MCP tool callers.
 */

export type AnkiErrorCode =
  | 'ANKI_UNREACHABLE'
  | 'ANKI_TIMEOUT'
  | 'ANKI_API_ERROR'
  | 'READ_ONLY_MODE'
  | 'INSUFFICIENT_SCOPE'
  | 'CONFIRMATION_REQUIRED'
  | 'PROTECTED_DECK'
  | 'DECK_NOT_FOUND'
  | 'CARD_NOT_FOUND'
  | 'NOTE_NOT_FOUND'
  | 'MODEL_NOT_FOUND'
  | 'DUPLICATE_NOTE'
  | 'INVALID_SEARCH_QUERY'
  | 'INVALID_ARGUMENTS';

export interface StructuredErrorPayload {
  code: AnkiErrorCode;
  message: string;
  hint: string;
  retryable: boolean;
}

export class AnkiPluginError extends Error {
  public readonly code: AnkiErrorCode;
  public readonly hint: string;
  public readonly retryable: boolean;

  constructor(code: AnkiErrorCode, message: string, hint: string, retryable = false) {
    super(message);
    this.name = 'AnkiPluginError';
    this.code = code;
    this.hint = hint;
    this.retryable = retryable;
  }

  public toStructured(): StructuredErrorPayload {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      retryable: this.retryable,
    };
  }
}

export function createUnreachableError(target: string, detail?: string): AnkiPluginError {
  const suffix = detail ? ` (${detail})` : '';
  return new AnkiPluginError(
    'ANKI_UNREACHABLE',
    `Could not reach AnkiConnect at ${target}${suffix}.`,
    'Ensure Anki Desktop is running with the AnkiConnect add-on (2055492159) enabled, or run `npx chatgpt-anki-plugin bridge` if connecting from a remote MCP server.',
    true,
  );
}

export function createReadOnlyError(): AnkiPluginError {
  return new AnkiPluginError(
    'READ_ONLY_MODE',
    'Write operation blocked because ANKI_READ_ONLY=1 is enabled on this server.',
    'Set ANKI_READ_ONLY=0 in the server environment to enable creating, updating, reviewing, or deleting items.',
    false,
  );
}

export function createInsufficientScopeError(requiredScope: string): AnkiPluginError {
  return new AnkiPluginError(
    'INSUFFICIENT_SCOPE',
    `The current OAuth access token does not include the required scope '${requiredScope}'.`,
    `Re-authorize the connector and grant the '${requiredScope}' permission.`,
    false,
  );
}
