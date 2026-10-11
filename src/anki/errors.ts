/**
 * Typed error hierarchy for the Anki adapter layer.
 * Mapping to MCP tool error payloads happens in src/tools/errors.ts.
 */

export class AnkiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** AnkiConnect reached but returned an error string (e.g. "deck was not found"). */
export class AnkiConnectError extends AnkiError {
  constructor(
    message: string,
    readonly action: string,
  ) {
    super(message, 'ANKI_ERROR');
  }
}

/** AnkiConnect could not be reached (network error, timeout, bad response). */
export class AnkiTransportError extends AnkiError {
  constructor(message: string) {
    super(message, 'ANKI_UNAVAILABLE');
  }
}

/** A deck/note/card referenced by the request does not exist. */
export class AnkiNotFoundError extends AnkiError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
  }
}

/** The operation conflicts with the current state (e.g. rename to an existing deck). */
export class AnkiConflictError extends AnkiError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}
