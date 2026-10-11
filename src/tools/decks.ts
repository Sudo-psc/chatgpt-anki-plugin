import { z } from 'zod';
import { defineTool, ToolErrors } from './types.js';
import { deckStatsSchema, deckSummarySchema } from './schemas.js';
import { toDeckDetailsJson, toDeckSummaryJson } from './mappers.js';

const listDecks = defineTool({
  name: 'list_decks',
  title: 'List Anki decks',
  description:
    'List every deck in the collection, including subdecks (names use "Parent::Child" notation and include the parent field). Read-only.',
  scope: 'anki:read',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({}),
  outputSchema: z.object({ decks: z.array(deckSummarySchema) }),
  handler: async (_input, ctx) => {
    const decks = await ctx.gateway.decks.list();
    return { decks: decks.map(toDeckSummaryJson) };
  },
});

const getDeck = defineTool({
  name: 'get_deck',
  title: 'Get deck details',
  description:
    'Get details for one deck by exact name: numeric id, parent, list of subdecks and due counts (new/learning/review/total). Read-only.',
  scope: 'anki:read',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({
    name: z.string().min(1).describe('Exact deck name, e.g. "Estudos::Anatomia"'),
  }),
  outputSchema: deckSummarySchema.extend({
    subdecks: z.array(z.string()),
    stats: deckStatsSchema.nullable(),
  }),
  handler: async (input, ctx) => {
    const deck = await ctx.gateway.decks.get(input.name);
    return toDeckDetailsJson(deck);
  },
});

const createDeck = defineTool({
  name: 'create_deck',
  title: 'Create deck',
  description:
    'Create a deck (or subdeck using "Parent::Child"). Calling it again with the same name returns the existing deck, so the operation is idempotent.',
  scope: 'anki:write',
  annotations: { destructiveHint: false, idempotentHint: true },
  inputSchema: z.object({
    name: z.string().min(1).describe('Deck name; use "Parent::Child" to create a subdeck'),
  }),
  outputSchema: z.object({ deck: deckSummarySchema }),
  handler: async (input, ctx) => {
    const deck = await ctx.gateway.decks.create(input.name);
    return { deck: toDeckSummaryJson(deck) };
  },
});

const updateDeck = defineTool({
  name: 'update_deck',
  title: 'Rename deck',
  description:
    'Rename a deck by moving its cards to a new name (AnkiConnect has no native rename action; this composes create + move + delete). Fails if the target name already exists or if the deck has subdecks.',
  scope: 'anki:write',
  annotations: { destructiveHint: false, idempotentHint: false },
  inputSchema: z.object({
    name: z.string().min(1).describe('Current exact deck name'),
    new_name: z.string().min(1).describe('New deck name'),
  }),
  outputSchema: z.object({
    updated: z.literal(true),
    from: z.string(),
    to: z.string(),
  }),
  handler: async (input, ctx) => {
    await ctx.gateway.decks.rename(input.name, input.new_name);
    return { updated: true as const, from: input.name, to: input.new_name };
  },
});

const deleteDeck = defineTool({
  name: 'delete_deck',
  title: 'Delete deck (destructive)',
  description:
    'Permanently delete a deck AND all its cards (cardsToo=true). Requires confirm=true as an explicit safeguard. Destructive and irreversible via AnkiConnect.',
  scope: 'anki:write',
  annotations: { destructiveHint: true, idempotentHint: false },
  inputSchema: z.object({
    name: z.string().min(1).describe('Exact deck name to delete'),
    confirm: z.boolean().describe('Must be true to confirm the destructive deletion'),
  }),
  outputSchema: z.object({ deleted: z.literal(true), name: z.string() }),
  handler: async (input, ctx) => {
    if (input.confirm !== true) {
      throw ToolErrors.validation(
        `delete_deck requires confirm=true because it permanently deletes "${input.name}" and all its cards.`,
        'Ask the user to confirm, then call again with confirm=true.',
      );
    }
    await ctx.gateway.decks.remove(input.name);
    return { deleted: true as const, name: input.name };
  },
});

export const deckTools = [listDecks, getDeck, createDeck, updateDeck, deleteDeck];
