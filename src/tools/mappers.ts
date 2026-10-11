import type {
  CardView,
  DeckDetails,
  DeckStats,
  DeckSummary,
  NoteView,
  SearchPage,
  StatsResult,
} from '../domain/types.js';
import type { z } from 'zod';
import type { cardViewSchema, deckStatsSchema, deckSummarySchema } from './schemas.js';

/**
 * Domain (camelCase) → tool JSON (snake_case) mappers. The JSON shapes are the
 * public contract documented in docs/05-tools-mcp.md.
 */

export function toDeckSummaryJson(deck: DeckSummary): z.infer<typeof deckSummarySchema> {
  return { id: deck.id, name: deck.name, parent: deck.parent };
}

export function toDeckStatsJson(stats: DeckStats): z.infer<typeof deckStatsSchema> {
  return {
    new_count: stats.newCount,
    learn_count: stats.learnCount,
    review_count: stats.reviewCount,
    total_in_deck: stats.totalInDeck,
  };
}

export function toDeckDetailsJson(
  deck: DeckDetails,
): z.infer<typeof deckSummarySchema> & { subdecks: string[]; stats: z.infer<typeof deckStatsSchema> | null } {
  return {
    ...toDeckSummaryJson(deck),
    subdecks: deck.subdecks,
    stats: deck.stats ? toDeckStatsJson(deck.stats) : null,
  };
}

export function toCardJson(card: CardView): z.infer<typeof cardViewSchema> {
  return {
    card_id: card.cardId,
    note_id: card.noteId,
    deck: card.deck,
    model: card.model,
    question: card.question,
    answer: card.answer,
    tags: card.tags,
    due: card.due,
    interval_days: card.intervalDays,
    reps: card.reps,
    lapses: card.lapses,
    queue: card.queue,
    type: card.type,
    state: card.state,
  };
}

export function toSearchPageJson(page: SearchPage): { total: number; returned: number; cards: ReturnType<typeof toCardJson>[] } {
  return { total: page.total, returned: page.returned, cards: page.cards.map(toCardJson) };
}

export function toNoteJson(note: NoteView): {
  note_id: number;
  model: string;
  fields: Record<string, string>;
  tags: string[];
} {
  return { note_id: note.noteId, model: note.model, fields: note.fields, tags: note.tags };
}

export function toStatsJson(stats: StatsResult): {
  reviewed_today: number;
  counts: { new_count: number; learning_count: number; review_count: number; due_count: number };
  deck?: string;
  deck_stats?: z.infer<typeof deckStatsSchema>;
} {
  return {
    reviewed_today: stats.reviewedToday,
    counts: {
      new_count: stats.counts.newCount,
      learning_count: stats.counts.learningCount,
      review_count: stats.counts.reviewCount,
      due_count: stats.counts.dueCount,
    },
    ...(stats.deck !== undefined ? { deck: stats.deck } : {}),
    ...(stats.deckStats !== undefined ? { deck_stats: toDeckStatsJson(stats.deckStats) } : {}),
  };
}
