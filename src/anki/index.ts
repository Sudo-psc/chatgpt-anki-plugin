import { AnkiConnectClient, type AnkiConnectClientOptions } from './client.js';
import { CardsAdapter } from './cards.js';
import { DecksAdapter } from './decks.js';
import { NotesAdapter } from './notes.js';
import { ReviewAdapter } from './review.js';

export { AnkiConnectClient } from './client.js';
export { CardsAdapter } from './cards.js';
export { DecksAdapter } from './decks.js';
export { NotesAdapter } from './notes.js';
export { ReviewAdapter } from './review.js';
export {
  AnkiError,
  AnkiConnectError,
  AnkiTransportError,
  AnkiNotFoundError,
  AnkiConflictError,
} from './errors.js';

export type { AnkiConnectClientOptions };

/**
 * Single entry point the MCP tool layer talks to. Swapping the backing
 * strategy (AnkiConnect, headless Anki, ...) only requires another
 * implementation of this facade — see ADR-0001.
 */
export class AnkiGateway {
  readonly client: AnkiConnectClient;
  readonly decks: DecksAdapter;
  readonly cards: CardsAdapter;
  readonly notes: NotesAdapter;
  readonly review: ReviewAdapter;

  constructor(options: AnkiConnectClientOptions) {
    this.client = new AnkiConnectClient(options);
    this.decks = new DecksAdapter(this.client);
    this.cards = new CardsAdapter(this.client);
    this.notes = new NotesAdapter(this.client);
    this.review = new ReviewAdapter(this.client);
  }

  async ready(): Promise<{ ok: true; version: number }> {
    const version = await this.client.ping();
    return { ok: true, version };
  }
}
