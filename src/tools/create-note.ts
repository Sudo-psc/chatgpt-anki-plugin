import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildWidgetMeta, okResult, runToolWithTelemetry, type ToolExecutionContext } from './context.js';

export function registerCreateNoteTool(server: McpServer, ctx: ToolExecutionContext): void {
  server.registerTool(
    'create_note',
    {
      title: 'Create Anki Note',
      description:
        'Create a new flashcard note in a specified Anki deck and note model (e.g., "Basic" with Front/Back or "Cloze" with Text/Extra).',
      inputSchema: {
        deckName: z.string().min(1).describe('Destination deck name (e.g. "Medicina::Cardiologia").'),
        modelName: z
          .string()
          .min(1)
          .optional()
          .default('Basic')
          .describe('Anki note type / model name (default "Basic"; also supports "Cloze" or custom models).'),
        fields: z
          .record(z.string(), z.string())
          .describe('Map of field names to HTML/text values (e.g. `{ Front: "Question", Back: "Answer" }`).'),
        tags: z
          .array(z.string().min(1))
          .optional()
          .default([])
          .describe('Optional list of tags to attach to the note.'),
        allowDuplicate: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to allow creating a duplicate note with the same primary field (default false).'),
        duplicateScope: z
          .enum(['deck', 'collection'])
          .optional()
          .default('deck')
          .describe('Scope used when checking for duplicates ("deck" or "collection").'),
        createDeckIfMissing: z
          .boolean()
          .optional()
          .default(true)
          .describe('Automatically create the target deck if it does not exist yet (default true).'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: buildWidgetMeta({
        invoking: 'Creating Anki note…',
        invoked: 'Anki note created',
      }),
    },
    async (args) =>
      runToolWithTelemetry('create_note', ctx, { requiredScope: 'anki:write', requiresWrite: true }, async () => {
        const res = await ctx.anki.createNote({
          deckName: args.deckName,
          modelName: args.modelName,
          fields: args.fields,
          tags: args.tags,
          allowDuplicate: args.allowDuplicate,
          duplicateScope: args.duplicateScope,
          createDeckIfMissing: args.createDeckIfMissing,
        });
        return okResult(
          res,
          `Created note ${res.noteId} in deck '${res.deckName}' (model '${res.modelName}', tags: ${res.tags.join(', ') || 'none'}).`,
        );
      }),
  );
}
