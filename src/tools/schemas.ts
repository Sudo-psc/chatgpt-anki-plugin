import { z } from 'zod';

/** JSON (snake_case) shapes returned by the tools. Mirrors src/domain/types.ts. */

export const deckSummarySchema = z.object({
  id: z.number().int().describe('Numeric deck id in the collection'),
  name: z.string().describe('Full deck name, e.g. "Estudos::Anatomia"'),
  parent: z.string().nullable().describe('Parent deck name, or null for top-level decks'),
});

export const deckStatsSchema = z.object({
  new_count: z.number().int(),
  learn_count: z.number().int(),
  review_count: z.number().int(),
  total_in_deck: z.number().int(),
});

export const cardViewSchema = z.object({
  card_id: z.number().int(),
  note_id: z.number().int(),
  deck: z.string(),
  model: z.string(),
  question: z.string().describe('Rendered question as plain text (HTML stripped)'),
  answer: z.string().describe('Rendered answer as plain text (HTML stripped)'),
  tags: z.array(z.string()),
  due: z.number().int().nullable().describe('Due value (day number for review cards, epoch seconds for learning cards)'),
  interval_days: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  queue: z.number().int().describe('Raw Anki queue value (-1 suspended, 0 new, 1 learning, 2 review, 3 day-learning)'),
  type: z.number().int().describe('Raw Anki card type (0 new, 1 learning, 2 review, 3 relearning)'),
  state: z.enum(['new', 'learning', 'review', 'relearning', 'suspended', 'unknown']),
});

export const searchPageSchema = z.object({
  total: z.number().int().describe('Total cards matching the query before limit'),
  returned: z.number().int(),
  cards: z.array(cardViewSchema),
});

export const noteViewSchema = z.object({
  note_id: z.number().int(),
  model: z.string(),
  fields: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
});
