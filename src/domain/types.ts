/**
 * Domain entities exposed by the MCP tools. These are the stable, documented
 * shapes; the AnkiConnect wire format is mapped into them by domain/mappers.ts.
 */

export interface DeckSummary {
  id: number;
  name: string;
  parent: string | null;
}

export interface DeckStats {
  newCount: number;
  learnCount: number;
  reviewCount: number;
  totalInDeck: number;
}

export interface DeckDetails extends DeckSummary {
  subdecks: string[];
  stats: DeckStats | null;
}

export type CardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended' | 'unknown';

export interface CardView {
  cardId: number;
  noteId: number;
  deck: string;
  model: string;
  question: string;
  answer: string;
  tags: string[];
  due: number | null;
  intervalDays: number;
  reps: number;
  lapses: number;
  queue: number;
  type: number;
  state: CardState;
}

export interface NoteView {
  noteId: number;
  model: string;
  fields: Record<string, string>;
  tags: string[];
}

export interface SearchPage {
  total: number;
  returned: number;
  cards: CardView[];
}

export type ReviewEase = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewOutcome {
  cardId: number;
  ease: ReviewEase;
  answered: boolean;
}

export interface CollectionCounts {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  dueCount: number;
}

export interface StatsResult {
  reviewedToday: number;
  counts: CollectionCounts;
  deck?: string;
  deckStats?: DeckStats;
}
