/**
 * AnkiConnect API v6 wire shapes (the subset used by this project).
 * Reference: https://git.sr.ht/~foosoft/anki-connect (actions documentation).
 * These types describe exactly what AnkiConnect returns — do not "fix" them
 * to domain shapes; mapping happens in src/domain/mappers.ts.
 */

export interface AnkiFieldValue {
  value: string;
  order: number;
}

export interface AnkiCardInfo {
  cardId: number;
  note: number;
  deckName: string;
  modelName: string;
  question: string;
  answer: string;
  fields: Record<string, AnkiFieldValue>;
  fieldOrder: number;
  ord: number;
  factor: number;
  interval: number;
  /** Day number (review cards) or epoch seconds (learning cards); semantics depend on queue. */
  due: number;
  reps: number;
  lapses: number;
  left: number;
  mod: number;
  type: number;
  queue: number;
}

export interface AnkiNoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, AnkiFieldValue>;
  cards: number[];
  mod: number;
}

export interface AnkiDeckStatsWire {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_in_deck: number;
}

export interface AnkiAddNoteParams {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  options: { allowDuplicate: boolean };
  tags: string[];
}
