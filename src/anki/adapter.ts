import type {
  CardDetails,
  CardSummary,
  CollectionStats,
  CreateNoteInput,
  DeckDetails,
  DeckSummary,
  NoteDetails,
  ReviewEase,
  SubmitReviewResult,
  UpdateDeckInput,
  UpdateDeckResult,
  UpdateNoteInput,
} from '../domain/entities.js';

export interface SearchCardsResult {
  query: string;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  cards: CardSummary[];
}

export interface DueCardsResult {
  deckName: string | null;
  totalDue: number;
  returnedCount: number;
  cards: CardSummary[];
}

export interface AnkiHealthStatus {
  backend: string;
  reachable: boolean;
  version?: number;
  bridgeConnected?: boolean;
  detail?: string;
}

/**
 * The seam implemented by every Anki backend:
 * - AnkiConnectAdapter (direct HTTP to 127.0.0.1:8765)
 * - BridgeRelayAdapter (WebSocket tunnel from remote HTTPS server to user's local AnkiConnect)
 * - InMemoryAnkiAdapter (deterministic sandbox for tests, CI, and OpenAI App review)
 */
export interface AnkiAdapter {
  readonly backendName: string;
  checkHealth(): Promise<AnkiHealthStatus>;

  // Decks
  listDecks(query?: string, includeStats?: boolean): Promise<DeckSummary[]>;
  getDeck(deckName: string, sampleLimit?: number): Promise<DeckDetails>;
  createDeck(deckName: string): Promise<{ deckId: number; deckName: string; created: boolean }>;
  updateDeck(input: UpdateDeckInput): Promise<UpdateDeckResult>;
  deleteDeck(deckName: string): Promise<{ deleted: true; deckName: string }>;

  // Cards & Search
  searchCards(query: string, limit?: number, offset?: number): Promise<SearchCardsResult>;
  getCard(cardId: number, includeReviews?: boolean): Promise<CardDetails>;

  // Notes
  createNote(input: CreateNoteInput): Promise<{
    noteId: number;
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags: string[];
  }>;
  updateNote(input: UpdateNoteInput): Promise<NoteDetails>;
  deleteNotes(noteIds: number[]): Promise<{ deleted: true; deletedNoteIds: number[]; count: number }>;

  // Reviews & Statistics
  getDueCards(options?: {
    deckName?: string;
    tag?: string;
    includeNew?: boolean;
    limit?: number;
  }): Promise<DueCardsResult>;
  submitReview(cardId: number, ease: ReviewEase): Promise<SubmitReviewResult>;
  getStats(options?: { deckName?: string; days?: number }): Promise<CollectionStats>;

  // Raw JSON-RPC invocation (used by bridge relay)
  invokeRaw?(action: string, params?: Record<string, unknown>): Promise<unknown>;
}
