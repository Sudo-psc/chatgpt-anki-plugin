import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AnkiPluginError } from '../domain/errors.js';
import { buildWidgetMeta, okResult, runToolWithTelemetry, type ToolExecutionContext } from './context.js';

export function registerDeleteDeckTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'delete_deck',
    {
      title: 'Delete Anki Deck',
      description:
        'Permanently delete an Anki deck and its cards. Requires `confirm: true` to prevent accidental data loss.',
      inputSchema: {
        deckName: z.string().min(1).describe('Exact name of the deck to delete.'),
        confirm: z
          .boolean()
          .describe('Must be set to true after the user explicitly confirms deleting the deck and its cards.'),
        allowDefault: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to allow deleting the root "Default" deck (default false).'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        invoking: 'Deleting Anki deck…',
        invoked: 'Anki deck deleted',
      }),
    },
    async (args) =>
      runToolWithTelemetry('delete_deck', ctx, { requiredScope: 'anki:delete', requiresWrite: true }, async () => {
        if (!args.confirm) {
          throw new AnkiPluginError(
            'CONFIRMATION_REQUIRED',
            `Refusing to delete deck '${args.deckName}' without explicit confirmation (confirm=true).`,
            'Ask the user to confirm deck deletion, then call delete_deck with confirm: true.',
            false,
          );
        }
        if (args.deckName.trim() === 'Default' && !args.allowDefault) {
          throw new AnkiPluginError(
            'PROTECTED_DECK',
            'Refusing to delete the "Default" deck unless allowDefault=true is explicitly passed.',
            'Pass allowDefault: true only if the user explicitly wants to delete the Default deck.',
            false,
          );
        }

        const res = await ctx.anki.deleteDeck(args.deckName.trim());
        return okResult(res, `Deleted deck '${res.deckName}'.`);
      }),
  );
}
