import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildWidgetMeta,
  DECK_BROWSER_WIDGET_URI,
  okResult,
  runToolWithTelemetry,
  type ToolExecutionContext,
} from './context.js';

export function registerGetStatsTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'get_stats',
    {
      title: 'Get Anki Study & Collection Statistics',
      description:
        'Retrieve study performance and collection statistics: cards reviewed today, daily review counts, card state distribution (new, learning, review, due, suspended), and per-deck breakdowns.',
      inputSchema: {
        deckName: z
          .string()
          .min(1)
          .optional()
          .describe('Optional deck name to scope statistics to a specific deck and its subdecks.'),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .default(7)
          .describe('Number of recent days to include in `reviewsByDay` (1..365, default 7).'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        templateUri: DECK_BROWSER_WIDGET_URI,
        invoking: 'Calculating Anki statistics…',
        invoked: 'Anki statistics ready',
      }),
    },
    async (args) =>
      runToolWithTelemetry('get_stats', ctx, { requiredScope: 'anki:read' }, async () => {
        const stats = await ctx.anki.getStats({
          deckName: args.deckName,
          days: args.days,
        });
        return okResult(
          { ...stats },
          `Collection stats${stats.deckName ? ` (${stats.deckName})` : ''}: ${stats.reviewedToday} reviewed today; ${stats.totals.due} due, ${stats.totals.new} new, ${stats.totals.learning} learning, ${stats.totals.review} review (${stats.totals.total} total cards).`,
          DECK_BROWSER_WIDGET_URI,
        );
      }),
  );
}
