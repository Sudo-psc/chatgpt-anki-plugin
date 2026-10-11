import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildWidgetMeta, okResult, runToolWithTelemetry, type ToolExecutionContext } from './context.js';

export function registerUpdateDeckTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'update_deck',
    {
      title: 'Update Anki Deck or Move Cards',
      description:
        'Move specific cards into a deck (`cardIds`) or rename/migrate a deck (`newName`) by moving its cards into the new deck name.',
      inputSchema: {
        deckName: z.string().min(1).describe('Current deck name (or destination deck when only moving `cardIds`).'),
        newName: z
          .string()
          .min(1)
          .optional()
          .describe('Optional new deck name. When provided, cards in `deckName` are migrated to `newName`.'),
        cardIds: z
          .array(z.number().int().positive())
          .optional()
          .describe('Optional list of card IDs to move into the target deck.'),
        removeOldDeck: z
          .boolean()
          .optional()
          .default(true)
          .describe('When renaming via `newName`, whether to remove the old empty deck afterward (default true).'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        invoking: 'Updating Anki deck…',
        invoked: 'Anki deck updated',
      }),
    },
    async (args) =>
      runToolWithTelemetry('update_deck', ctx, { requiredScope: 'anki:write', requiresWrite: true }, async () => {
        const res = await ctx.anki.updateDeck({
          deckName: args.deckName,
          newName: args.newName,
          cardIds: args.cardIds,
          removeOldDeck: args.removeOldDeck,
        });
        return okResult(
          { ...res },
          `Updated deck '${res.deckName}' -> '${res.targetDeckName}' (${res.movedCardsCount} card(s) moved).`,
        );
      }),
  );
}
