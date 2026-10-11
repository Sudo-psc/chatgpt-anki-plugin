import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildWidgetMeta,
  DECK_BROWSER_WIDGET_URI,
  okResult,
  runToolWithTelemetry,
  type ToolExecutionContext,
} from './context.js';

export function registerGetDeckTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'get_deck',
    {
      title: 'Get Anki Deck Details',
      description:
        'Inspect a specific Anki deck by name, including queue counts, direct subdecks, deck options config, and a sample of cards.',
      inputSchema: {
        deckName: z
          .string()
          .min(1)
          .describe('Exact deck name to inspect (use "::" for subdecks, e.g. "Medicina::Cardiologia").'),
        sampleLimit: z
          .number()
          .int()
          .min(0)
          .max(50)
          .optional()
          .default(10)
          .describe('Maximum number of sample cards to include from the deck (0..50, default 10).'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        templateUri: DECK_BROWSER_WIDGET_URI,
        invoking: 'Inspecting Anki deck…',
        invoked: 'Deck details ready',
      }),
    },
    async (args) =>
      runToolWithTelemetry('get_deck', ctx, { requiredScope: 'anki:read' }, async () => {
        const details = await ctx.anki.getDeck(args.deckName, args.sampleLimit);
        return okResult(
          {
            deck: {
              id: details.id,
              name: details.name,
              parentName: details.parentName,
              depth: details.depth,
              newCount: details.newCount,
              learnCount: details.learnCount,
              dueCount: details.dueCount,
              totalCards: details.totalCards,
            },
            subdecks: details.subdecks,
            config: details.config,
            sampleCards: details.sampleCards,
          },
          `Deck '${details.name}' (ID ${details.id}): ${details.totalCards} cards (${details.dueCount} due, ${details.newCount} new, ${details.learnCount} learning).`,
          DECK_BROWSER_WIDGET_URI,
        );
      }),
  );
}
