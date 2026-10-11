import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildWidgetMeta,
  DECK_BROWSER_WIDGET_URI,
  okResult,
  runToolWithTelemetry,
  type ToolExecutionContext,
} from './context.js';

export function registerSearchCardsTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'search_cards',
    {
      title: 'Search Anki Cards',
      description:
        'Search cards in the user Anki collection using native Anki search syntax (e.g., `deck:"Medicina::Cardiologia" tag:anatomia is:due prop:ivl>=14`).',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            'Native Anki search query expression (supports deck:, tag:, is:due, is:new, is:review, is:suspended, prop:ivl>=, field:term).',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(25)
          .describe('Maximum number of matching cards to return (1..100, default 25).'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(0)
          .describe('Pagination offset into matching cards (default 0).'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        templateUri: DECK_BROWSER_WIDGET_URI,
        invoking: 'Searching Anki cards…',
        invoked: 'Search completed',
      }),
    },
    async (args) =>
      runToolWithTelemetry('search_cards', ctx, { requiredScope: 'anki:read' }, async () => {
        const res = await ctx.anki.searchCards(args.query, args.limit, args.offset);
        return okResult(
          { ...res },
          `Query '${res.query}' matched ${res.total} card(s) (showing ${res.cards.length} from offset ${res.offset}).`,
          DECK_BROWSER_WIDGET_URI,
        );
      }),
  );
}
