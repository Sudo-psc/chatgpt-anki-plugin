import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildWidgetMeta, okResult, runToolWithTelemetry, type ToolExecutionContext } from './context.js';

export function registerCreateDeckTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'create_deck',
    {
      title: 'Create Anki Deck',
      description: 'Create a new Anki deck or hierarchical subdeck (using "Parent::Child" notation). Idempotent.',
      inputSchema: {
        deckName: z
          .string()
          .min(1)
          .max(200)
          .describe('Name of the deck or subdeck to create (e.g. "Concursos::Direito Constitucional").'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        invoking: 'Creating Anki deck…',
        invoked: 'Anki deck created',
      }),
    },
    async (args) =>
      runToolWithTelemetry('create_deck', ctx, { requiredScope: 'anki:write', requiresWrite: true }, async () => {
        const res = await ctx.anki.createDeck(args.deckName);
        return okResult(
          res,
          res.created
            ? `Created deck '${res.deckName}' (ID ${res.deckId}).`
            : `Deck '${res.deckName}' already exists (ID ${res.deckId}).`,
        );
      }),
  );
}
