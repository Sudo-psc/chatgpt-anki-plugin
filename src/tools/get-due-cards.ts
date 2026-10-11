import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RATING_OPTIONS } from '../anki/review.js';
import {
  buildWidgetMeta,
  okResult,
  REVIEW_SESSION_WIDGET_URI,
  runToolWithTelemetry,
  type ToolExecutionContext,
} from './context.js';

export function registerGetDueCardsTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'get_due_cards',
    {
      title: 'Get Due Cards for Review',
      description:
        'Fetch the queue of Anki cards currently due for review (optionally filtered by deck or tag) and launch the interactive review session widget.',
      inputSchema: {
        deckName: z.string().min(1).optional().describe('Optional deck name filter (e.g. "Medicina::Cardiologia").'),
        tag: z.string().min(1).optional().describe('Optional tag filter (e.g. "fisiologia").'),
        includeNew: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to also include new unseen cards (`is:new`) in the study queue (default true).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(15)
          .describe('Maximum number of due cards to return for the session (1..100, default 15).'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        templateUri: REVIEW_SESSION_WIDGET_URI,
        invoking: 'Preparing Anki review queue…',
        invoked: 'Review queue ready',
      }),
    },
    async (args) =>
      runToolWithTelemetry('get_due_cards', ctx, { requiredScope: 'anki:read' }, async () => {
        const res = await ctx.anki.getDueCards({
          deckName: args.deckName,
          tag: args.tag,
          includeNew: args.includeNew,
          limit: args.limit,
        });
        return okResult(
          {
            ...res,
            ratingOptions: RATING_OPTIONS,
          },
          `Found ${res.totalDue} card(s) ready for review${res.deckName ? ` in '${res.deckName}'` : ''} (loaded ${res.returnedCount}).`,
          REVIEW_SESSION_WIDGET_URI,
        );
      }),
  );
}
