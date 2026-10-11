import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AnkiPluginError } from '../domain/errors.js';
import { buildWidgetMeta, okResult, runToolWithTelemetry, type ToolExecutionContext } from './context.js';

export function registerDeleteNoteTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'delete_note',
    {
      title: 'Delete Anki Notes',
      description:
        'Permanently delete one or more Anki notes and all cards generated from them. Requires `confirm: true`.',
      inputSchema: {
        noteIds: z
          .array(z.number().int().positive())
          .min(1)
          .describe('List of numeric Anki noteIds to delete permanently.'),
        confirm: z
          .boolean()
          .describe('Must be true after the user explicitly confirms deleting the specified note(s).'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        invoking: 'Deleting Anki note(s)…',
        invoked: 'Anki note(s) deleted',
      }),
    },
    async (args) =>
      runToolWithTelemetry('delete_note', ctx, { requiredScope: 'anki:delete', requiresWrite: true }, async () => {
        if (!args.confirm) {
          throw new AnkiPluginError(
            'CONFIRMATION_REQUIRED',
            'Refusing to delete note(s) without explicit confirmation (confirm=true).',
            'Ask the user to confirm note deletion, then call delete_note with confirm: true.',
            false,
          );
        }
        const res = await ctx.anki.deleteNotes(args.noteIds);
        return okResult(res, `Deleted ${res.count} note(s): ${res.deletedNoteIds.join(', ')}.`);
      }),
  );
}
