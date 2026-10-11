/**
 * Core domain entities for Anki decks, notes, cards, reviews and statistics.
 */

export type CardType = 0 | 1 | 2 | 3; // 0=new, 1=learning, 2=review, 3=relearning
export type CardQueue = -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
export type ReviewEase = 1 | 2 | 3 | 4;
export type ReviewRatingLabel = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface DeckSummary {
  id: number;
  name: string;
  parentName: string | null;
  depth: number;
  newCount: number;
  learnCount: number;
  dueCount: number;
  totalCards: number;
}

export interface DeckConfigSummary {
  id: number;
  name: string;
  newPerDay: number;
  reviewsPerDay: number;
  maxTakenSeconds?: number;
}

export interface DeckDetails extends DeckSummary {
  subdecks: string[];
  config: DeckConfigSummary | null;
  sampleCards: CardSummary[];
}

export interface CardSummary {
  cardId: number;
  noteId: number;
  deckName: string;
  modelName: string;
  question: string;
  answer: string;
  fields: Record<string, string>;
  tags: string[];
  type: CardType;
  queue: CardQueue;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
  due: number;
}

export interface ReviewLogEntry {
  id: number;
  cardId: number;
  ease: ReviewEase;
  interval: number;
  lastInterval: number;
  factor: number;
  timeMs: number;
  type: number;
}

export interface CardDetails extends CardSummary {
  reviews: ReviewLogEntry[];
}

export interface NoteDetails {
  noteId: number;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  cards: number[];
}

export interface CreateNoteInput {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  allowDuplicate: boolean;
  duplicateScope: 'deck' | 'collection';
  createDeckIfMissing: boolean;
}

export interface UpdateNoteInput {
  noteId: number;
  fields?: Record<string, string>;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
}

export interface UpdateDeckInput {
  deckName: string;
  newName?: string;
  cardIds?: number[];
  removeOldDeck?: boolean;
}

export interface UpdateDeckResult {
  deckName: string;
  targetDeckName: string;
  movedCardsCount: number;
  deckId: number;
  removedOldDeck: boolean;
}

export interface SubmitReviewResult {
  cardId: number;
  ease: ReviewEase;
  ratingLabel: ReviewRatingLabel;
  success: boolean;
  updatedCard: CardSummary;
}

export interface DailyReviewCount {
  date: string;
  count: number;
}

export interface CollectionStats {
  deckName: string | null;
  reviewedToday: number;
  reviewsByDay: DailyReviewCount[];
  totals: {
    new: number;
    learning: number;
    review: number;
    due: number;
    suspended: number;
    total: number;
  };
  decks: DeckSummary[];
}
