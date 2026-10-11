import { AnkiConnectError, AnkiTransportError } from './errors.js';

export interface AnkiConnectClientOptions {
  /** Full URL of the AnkiConnect endpoint, e.g. http://127.0.0.1:8765 */
  url: string;
  apiKey?: string;
  timeoutMs?: number;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface AnkiResponse<T> {
  result: T | null;
  error: string | null;
}

const RETRY_HINT = 'Verify Anki Desktop is running with the AnkiConnect add-on installed (code 2055492159) and reachable.';

export class AnkiConnectClient {
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnkiConnectClientOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    const impl = options.fetchImpl ?? globalThis.fetch;
    if (typeof impl !== 'function') {
      throw new Error('No fetch implementation available. Node.js >= 20 is required.');
    }
    this.fetchImpl = impl;
  }

  async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const body: Record<string, unknown> = { action, version: 6, params };
    if (this.apiKey) body.key = this.apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${this.timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      throw new AnkiTransportError(
        `AnkiConnect request "${action}" to ${this.url} failed: ${reason}. ${RETRY_HINT}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new AnkiTransportError(
        `AnkiConnect returned HTTP ${response.status} for "${action}" at ${this.url}. ${RETRY_HINT}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AnkiTransportError(
        `AnkiConnect returned a non-JSON response for "${action}" at ${this.url}. ${RETRY_HINT}`,
      );
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('error' in payload) ||
      !('result' in payload)
    ) {
      throw new AnkiTransportError(
        `AnkiConnect returned an unexpected response shape for "${action}" at ${this.url}. ${RETRY_HINT}`,
      );
    }

    const { error, result } = payload as AnkiResponse<T>;
    if (error) {
      throw new AnkiConnectError(error, action);
    }
    return result as T;
  }

  /** Lightweight liveness probe: returns the AnkiConnect API version. */
  ping(): Promise<number> {
    return this.invoke<number>('version');
  }
}
