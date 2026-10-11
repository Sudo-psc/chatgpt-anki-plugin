import { mapNote } from '../domain/mappers.js';
import type { NoteView } from '../domain/types.js';
import type { AnkiConnectClient } from './client.js';
import { AnkiNotFoundError } from './errors.js';
import type { AnkiAddNoteParams, AnkiNoteInfo } from './wire-types.js';

export interface CreateNoteInput {
  deck: string;
  model: string;
  fields: Record<string, string>;
  tags: string[];
  allowDuplicate: boolean;
}

export class NotesAdapter {
  constructor(private readonly client: AnkiConnectClient) {}

  async create(input: CreateNoteInput): Promise<{ noteId: number }> {
    const note: AnkiAddNoteParams = {
      deckName: input.deck,
      modelName: input.model,
      fields: input.fields,
      options: { allowDuplicate: input.allowDuplicate },
      tags: input.tags,
    };
    const noteId = await this.client.invoke<number>('addNote', { note });
    return { noteId };
  }

  async get(noteId: number): Promise<NoteView> {
    const notes = await this.client.invoke<AnkiNoteInfo[]>('notesInfo', { notes: [noteId] });
    const note = notes[0];
    if (!note) {
      throw new AnkiNotFoundError(`Note ${noteId} does not exist. Use search_cards to find notes.`);
    }
    return mapNote(note);
  }

  async findExisting(noteIds: number[]): Promise<number[]> {
    if (noteIds.length === 0) return [];
    const query = noteIds.map((id) => `nid:${id}`).join(' or ');
    return this.client.invoke<number[]>('findNotes', { query });
  }

  async updateFields(noteId: number, fields: Record<string, string>): Promise<void> {
    await this.get(noteId);
    await this.client.invoke<null>('updateNoteFields', { note: { id: noteId, fields } });
  }

  /** Replaces the full tag list of the note (AnkiConnect updateNoteTags semantics). */
  async updateTags(noteId: number, tags: string[]): Promise<void> {
    await this.get(noteId);
    await this.client.invoke<null>('updateNoteTags', { note: noteId, tags });
  }

  async updateModel(noteId: number, modelName: string): Promise<void> {
    const current = await this.get(noteId);
    await this.client.invoke<null>('updateNoteModel', {
      note: { id: noteId, modelName, fields: current.fields },
      tags: current.tags,
    });
  }

  async remove(noteIds: number[]): Promise<{ deleted: number[]; notFound: number[] }> {
    const existing = await this.findExisting(noteIds);
    const existingSet = new Set(existing);
    const notFound = noteIds.filter((id) => !existingSet.has(id));
    if (existing.length > 0) {
      await this.client.invoke<null>('deleteNotes', { notes: existing });
    }
    return { deleted: existing, notFound };
  }

  async listTags(): Promise<string[]> {
    return this.client.invoke<string[]>('getTags');
  }

  async addTags(noteIds: number[], tags: string[]): Promise<number[]> {
    const existing = await this.findExisting(noteIds);
    if (existing.length > 0) {
      await this.client.invoke<null>('addTags', { notes: existing, tags: tags.join(' ') });
    }
    return existing;
  }

  async removeTags(noteIds: number[], tags: string[]): Promise<number[]> {
    const existing = await this.findExisting(noteIds);
    if (existing.length > 0) {
      await this.client.invoke<null>('removeTags', { notes: existing, tags: tags.join(' ') });
    }
    return existing;
  }

  async replaceTag(noteIds: number[], from: string, to: string): Promise<number[]> {
    const existing = await this.findExisting(noteIds);
    if (existing.length > 0) {
      await this.client.invoke<null>('replaceTags', {
        notes: existing,
        tag_to_replace: from,
        replace_with_tag: to,
      });
    }
    return existing;
  }

  async clearUnusedTags(): Promise<void> {
    await this.client.invoke<null>('clearUnusedTags');
  }

  async modelNames(): Promise<string[]> {
    return this.client.invoke<string[]>('modelNames');
  }

  async modelFieldNames(modelName: string): Promise<string[]> {
    return this.client.invoke<string[]>('modelFieldNames', { modelName });
  }

  async modelTemplates(modelName: string): Promise<Record<string, { Front: string; Back: string }>> {
    return this.client.invoke<Record<string, { Front: string; Back: string }>>('modelTemplates', {
      modelName,
    });
  }

  async modelStyling(modelName: string): Promise<string> {
    const styling = await this.client.invoke<{ css: string }>('modelStyling', { modelName });
    return styling.css;
  }

  async updateModelTemplates(
    modelName: string,
    templates: Record<string, { Front: string; Back: string }>,
  ): Promise<void> {
    await this.client.invoke<null>('updateModelTemplates', {
      model: { name: modelName, templates },
    });
  }

  async updateModelStyling(modelName: string, css: string): Promise<void> {
    await this.client.invoke<null>('updateModelStyling', { model: { name: modelName, css } });
  }
}
