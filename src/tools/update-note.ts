import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildWidgetMeta, okResult, runToolWithTelemetry, type ToolExecutionContext } from './context.js';

export function registerUpdateNoteTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'update_note',
    {
      title: 'Update Anki Note',
      description: 'Update the field contents and/or tags of an existing Anki note by `noteId`.',
      inputSchema: {
        noteId: z.number().int().positive().describe('Numeric ID of the Anki note to update.'),
        fields: z
          .record(z.string(), z.string())
          .optional()
          .describe('Optional map of field names and their updated values.'),
        tags: z
          .array(z.string())
          .optional()
          .describe('Optional full replacement list of tags for the note.'),
        addTags: z
          .array(z.string().min(1))
          .optional()
          .describe('Optional tags to add to the note without removing existing tags.'),
        removeTags: z
          .array(z.string().min(1))
          .optional()
          .describe('Optional tags to remove from the note.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        invoking: 'Updating Anki note…',
        invoked: 'Anki note updated',
      }),
    },
    async (args) =>
      runToolWithTelemetry('update_note', ctx, { requiredScope: 'anki:write', requiresWrite: true }, async () => {
        const note = await ctx.anki.updateNote({
          noteId: args.noteId,
          fields: args.fields,
          tags: args.tags,
          addTags: args.addTags,
          removeTags: args.removeTags,
        });
        return okResult(
          { note },
          `Updated note ${note.noteId} (tags: ${note.tags.join(', ') || 'none'}).`,
        );
      }),
  );
}
