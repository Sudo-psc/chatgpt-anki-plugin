import { z } from 'zod';
import { defineTool, ToolErrors } from './types.js';

const createNote = defineTool({
  name: 'create_note',
  title: 'Create note',
  description:
    'Create a note in a deck with the given model and field values. The deck is created automatically if it does not exist. Use allow_duplicate=true to bypass Anki\'s duplicate check (same first field + model).',
  scope: 'anki:write',
  annotations: { destructiveHint: false, idempotentHint: false },
  inputSchema: z.object({
    deck: z.string().min(1).describe('Exact deck name (subdecks supported with "Parent::Child")'),
    model: z.string().min(1).describe('Note type name, e.g. "Basic" or "Cloze"'),
    fields: z
      .record(z.string().min(1), z.string())
      .refine((fields) => Object.keys(fields).length > 0, 'Provide at least one field')
      .describe('Field values keyed by exact field name, e.g. {"Front": "...", "Back": "..."}'),
    tags: z.array(z.string().min(1)).default([]).describe('Tags to attach to the note'),
    allow_duplicate: z.boolean().default(false).describe('Allow creating a note that Anki considers a duplicate'),
  }),
  outputSchema: z.object({
    created: z.literal(true),
    note_id: z.number().int().describe('Id of the created note'),
  }),
  handler: async (input, ctx) => {
    const result = await ctx.gateway.notes.create({
      deck: input.deck,
      model: input.model,
      fields: input.fields,
      tags: input.tags,
      allowDuplicate: input.allow_duplicate,
    });
    return { created: true as const, note_id: result.noteId };
  },
});

const updateNote = defineTool({
  name: 'update_note',
  title: 'Update note',
  description:
    'Update an existing note: replace field values (partial merge), replace the full tag list, or change the note type (model). Provide at least one of fields/tags/model. Field values for a model change must match the target model\'s field names.',
  scope: 'anki:write',
  annotations: { destructiveHint: false, idempotentHint: true },
  inputSchema: z.object({
    note_id: z.number().int().positive().describe('Numeric note id (from search_cards results)'),
    fields: z
      .record(z.string().min(1), z.string())
      .optional()
      .describe('Field values to merge, e.g. {"Back": "corrected answer"}'),
    tags: z
      .array(z.string().min(1))
      .optional()
      .describe('New full tag list (replaces existing tags) — use manage_tags for add/remove merge semantics'),
    model: z.string().min(1).optional().describe('New note type (model) name'),
  }),
  outputSchema: z.object({
    updated: z.literal(true),
    note_id: z.number().int(),
    updated_fields: z.array(z.string()),
    updated_tags: z.boolean(),
    updated_model: z.boolean(),
  }),
  handler: async (input, ctx) => {
    if (input.fields === undefined && input.tags === undefined && input.model === undefined) {
      throw ToolErrors.validation(
        'update_note requires at least one of "fields", "tags" or "model".',
        'Example: {"note_id": 42, "tags": ["prova", "revisar"]}',
      );
    }
    const updatedFields: string[] = [];
    let updatedTags = false;
    let updatedModel = false;
    if (input.fields !== undefined) {
      await ctx.gateway.notes.updateFields(input.note_id, input.fields);
      updatedFields.push(...Object.keys(input.fields));
    }
    if (input.tags !== undefined) {
      await ctx.gateway.notes.updateTags(input.note_id, input.tags);
      updatedTags = true;
    }
    if (input.model !== undefined) {
      await ctx.gateway.notes.updateModel(input.note_id, input.model);
      updatedModel = true;
    }
    return { updated: true as const, note_id: input.note_id, updated_fields: updatedFields, updated_tags: updatedTags, updated_model: updatedModel };
  },
});

const deleteNote = defineTool({
  name: 'delete_note',
  title: 'Delete notes (destructive)',
  description:
    'Permanently delete up to 100 notes and their cards. Requires confirm=true as an explicit safeguard. Returns which ids were deleted and which were not found.',
  scope: 'anki:write',
  annotations: { destructiveHint: true, idempotentHint: false },
  inputSchema: z.object({
    note_ids: z.array(z.number().int().positive()).min(1).max(100).describe('Note ids to delete (max 100)'),
    confirm: z.boolean().describe('Must be true to confirm the destructive deletion'),
  }),
  outputSchema: z.object({
    deleted: z.array(z.number().int()),
    not_found: z.array(z.number().int()),
  }),
  handler: async (input, ctx) => {
    if (input.confirm !== true) {
      throw ToolErrors.validation(
        `delete_note requires confirm=true because it permanently deletes ${input.note_ids.length} note(s) and their cards.`,
        'Ask the user to confirm, then call again with confirm=true.',
      );
    }
    const result = await ctx.gateway.notes.remove(input.note_ids);
    return { deleted: result.deleted, not_found: result.notFound };
  },
});

const manageTags = defineTool({
  name: 'manage_tags',
  title: 'Manage tags',
  description:
    'Manage tags: list all tags, add tags to notes, remove tags from notes, replace a tag with another, or remove unused tags from the collection.',
  scope: 'anki:write',
  annotations: { destructiveHint: true, idempotentHint: false },
  inputSchema: z.object({
    action: z.enum(['list', 'add', 'remove', 'replace', 'clear_unused']).describe('Operation to perform'),
    tags: z.array(z.string().min(1)).default([]).describe('Tags to add/remove (for add/remove actions)'),
    note_ids: z
      .array(z.number().int().positive())
      .max(100)
      .default([])
      .describe('Target note ids (required for add/remove/replace)'),
    replace_from: z.string().min(1).optional().describe('Tag to replace (required for action=replace)'),
    replace_to: z.string().min(1).optional().describe('Replacement tag (required for action=replace)'),
  }),
  outputSchema: z.object({
    action: z.enum(['list', 'add', 'remove', 'replace', 'clear_unused']),
    tags: z.array(z.string()).describe('Current tag list (all tags for list/clear_unused; affected tags otherwise)'),
    updated_note_ids: z.array(z.number().int()),
  }),
  handler: async (input, ctx) => {
    switch (input.action) {
      case 'list': {
        const tags = await ctx.gateway.notes.listTags();
        return { action: input.action, tags, updated_note_ids: [] };
      }
      case 'clear_unused': {
        await ctx.gateway.notes.clearUnusedTags();
        const tags = await ctx.gateway.notes.listTags();
        return { action: input.action, tags, updated_note_ids: [] };
      }
      case 'add': {
        if (input.tags.length === 0 || input.note_ids.length === 0) {
          throw ToolErrors.validation('manage_tags action="add" requires non-empty "tags" and "note_ids".');
        }
        const ids = await ctx.gateway.notes.addTags(input.note_ids, input.tags);
        return { action: input.action, tags: input.tags, updated_note_ids: ids };
      }
      case 'remove': {
        if (input.tags.length === 0 || input.note_ids.length === 0) {
          throw ToolErrors.validation('manage_tags action="remove" requires non-empty "tags" and "note_ids".');
        }
        const ids = await ctx.gateway.notes.removeTags(input.note_ids, input.tags);
        return { action: input.action, tags: input.tags, updated_note_ids: ids };
      }
      case 'replace': {
        if (input.replace_from === undefined || input.replace_to === undefined || input.note_ids.length === 0) {
          throw ToolErrors.validation(
            'manage_tags action="replace" requires "replace_from", "replace_to" and non-empty "note_ids".',
          );
        }
        const ids = await ctx.gateway.notes.replaceTag(input.note_ids, input.replace_from, input.replace_to);
        return { action: input.action, tags: [input.replace_to], updated_note_ids: ids };
      }
    }
  },
});

export const noteTools = [createNote, updateNote, deleteNote, manageTags];
