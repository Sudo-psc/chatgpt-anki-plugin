import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildWidgetMeta, okResult, runToolWithTelemetry, type ToolExecutionContext } from './context.js';

export function registerGetCardTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'get_card',
    {
      title: 'Get Anki Card Details',
      description:
        'Retrieve full details for a single Anki card by `cardId`, including all note fields, tags, scheduling parameters, and review history.',
      inputSchema: {
        cardId: z.number().int().positive().describe('Numeric Anki cardId to inspect.'),
        includeReviews: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to include the review log entries for this card (default true).'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        invoking: 'Fetching Anki card…',
        invoked: 'Anki card loaded',
      }),
    },
    async (args) =>
      runToolWithTelemetry('get_card', ctx, { requiredScope: 'anki:read' }, async () => {
        const details = await ctx.anki.getCard(args.cardId, args.includeReviews);
        const { reviews, ...card } = details;
        return okResult(
          {
            card,
            reviews,
          },
          `Card ${card.cardId} (Note ${card.noteId}, Deck '${card.deckName}'): interval=${card.interval}d, reps=${card.reps}, lapses=${card.lapses}.`,
        );
      }),
  );
}
