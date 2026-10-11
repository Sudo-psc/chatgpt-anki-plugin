import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildWidgetMeta,
  DECK_BROWSER_WIDGET_URI,
  okResult,
  runToolWithTelemetry,
  type ToolExecutionContext,
} from './context.js';

export function registerListDecksTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'list_decks',
    {
      title: 'List Anki Decks',
      description:
        'List all decks and subdecks in the user Anki collection with card counts (new, learning, due, total).',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Optional case-insensitive substring filter applied to deck names (e.g. "Medicina").'),
        includeStats: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to fetch card queue counts (new, learning, due, total) for each deck.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        templateUri: DECK_BROWSER_WIDGET_URI,
        invoking: 'Loading Anki decks…',
        invoked: 'Anki decks loaded',
      }),
    },
    async (args) =>
      runToolWithTelemetry('list_decks', ctx, { requiredScope: 'anki:read' }, async () => {
        const decks = await ctx.anki.listDecks(args.query, args.includeStats);
        const totalDue = decks.reduce((sum, d) => sum + d.dueCount, 0);
        return okResult(
          {
            totalDecks: decks.length,
            decks,
          },
          `Found ${decks.length} deck(s) (${totalDue} due cards across listed decks).`,
          DECK_BROWSER_WIDGET_URI,
        );
      }),
  );
}
