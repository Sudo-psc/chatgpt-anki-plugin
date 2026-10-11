import { z } from 'zod';
import { defineTool } from './types.js';
import { deckStatsSchema } from './schemas.js';
import { toStatsJson } from './mappers.js';

const submitReview = defineTool({
  name: 'submit_review',
  title: 'Submit card review',
  description:
    'Answer a card with an ease grade (again/hard/good/easy), exactly like pressing the review buttons in Anki. Reschedules the card with the scheduler. Requires a recent AnkiConnect add-on (answerCards action).',
  scope: 'anki:review',
  annotations: { destructiveHint: false, idempotentHint: false },
  inputSchema: z.object({
    card_id: z.number().int().positive().describe('Card id to answer (from get_due_cards or search_cards)'),
    ease: z
      .enum(['again', 'hard', 'good', 'easy'])
      .describe('Answer grade: again=1, hard=2, good=3, easy=4 (same as Anki buttons)'),
  }),
  outputSchema: z.object({
    card_id: z.number().int(),
    ease: z.enum(['again', 'hard', 'good', 'easy']),
    answered: z.boolean().describe('True when Anki confirmed the card was answered'),
  }),
  handler: async (input, ctx) => {
    const outcome = await ctx.gateway.review.submit(input.card_id, input.ease);
    return { card_id: outcome.cardId, ease: outcome.ease, answered: outcome.answered };
  },
});

const getStats = defineTool({
  name: 'get_stats',
  title: 'Get study statistics',
  description:
    'Get review statistics: cards reviewed today plus counts of new/learning/review/due cards for the whole collection or a specific deck (including due counts from the deck tree). Read-only.',
  scope: 'anki:read',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({
    deck: z.string().min(1).optional().describe('Optional exact deck name to scope the statistics'),
  }),
  outputSchema: z.object({
    reviewed_today: z.number().int(),
    counts: z.object({
      new_count: z.number().int(),
      learning_count: z.number().int(),
      review_count: z.number().int(),
      due_count: z.number().int(),
    }),
    deck: z.string().optional(),
    deck_stats: deckStatsSchema.optional(),
  }),
  handler: async (input, ctx) => {
    const stats = await ctx.gateway.review.stats(input.deck);
    return toStatsJson(stats);
  },
});

export const reviewTools = [submitReview, getStats];
