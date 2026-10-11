import { z } from 'zod';
import { defineTool } from './types.js';
import { cardViewSchema, searchPageSchema } from './schemas.js';
import { toCardJson, toSearchPageJson } from './mappers.js';

const searchCards = defineTool({
  name: 'search_cards',
  title: 'Search cards and notes',
  description:
    'Search cards/notes using the native Anki search syntax (e.g. deck:"Estudos::Anatomia" tag:farmacologia is:due, or free text). Returns matching cards with question/answer rendered as plain text. Read-only.',
  scope: 'anki:read',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe('Anki search query. Examples: deck:"Default" is:due | tag:prova | is:new | free text (substring match)'),
    limit: z.number().int().min(1).max(200).default(25).describe('Maximum number of cards to return (1-200)'),
  }),
  outputSchema: searchPageSchema,
  handler: async (input, ctx) => {
    const page = await ctx.gateway.cards.search(input.query, input.limit);
    return toSearchPageJson(page);
  },
});

const getCard = defineTool({
  name: 'get_card',
  title: 'Get card details',
  description:
    'Get a single card by id: deck, model, question/answer as plain text, scheduling (due, interval, state) and note tags. Read-only.',
  scope: 'anki:read',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({
    card_id: z.number().int().positive().describe('Numeric card id (from search_cards or get_due_cards)'),
  }),
  outputSchema: cardViewSchema,
  handler: async (input, ctx) => {
    const card = await ctx.gateway.cards.get(input.card_id);
    return toCardJson(card);
  },
});

const getDueCards = defineTool({
  name: 'get_due_cards',
  title: 'Get due cards',
  description:
    'List cards currently due for review, optionally restricted to a deck (including its subdecks). Use this to start a review session, then answer with submit_review. Read-only.',
  scope: 'anki:review',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({
    deck: z.string().min(1).optional().describe('Optional exact deck name to restrict the session'),
    limit: z.number().int().min(1).max(200).default(20).describe('Maximum number of cards to return (1-200)'),
  }),
  outputSchema: searchPageSchema.extend({
    total_due: z.number().int().describe('Total due cards before applying the limit'),
  }),
  handler: async (input, ctx) => {
    const page = await ctx.gateway.cards.due(input.deck, input.limit);
    return { total_due: page.total, ...toSearchPageJson(page) };
  },
});

export const cardTools = [searchCards, getCard, getDueCards];
