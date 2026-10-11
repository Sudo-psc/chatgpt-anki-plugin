import { describe, expect, it } from 'vitest';
import { MockAnkiConnect } from '../../src/anki/mock/mock-anki-connect.js';
import { seedCollection } from '../../src/anki/mock/seed.js';

function fresh(): MockAnkiConnect {
  return MockAnkiConnect.withSeed(seedCollection());
}

describe('MockAnkiConnect (emulador de teste)', () => {
  it('lists every deck including subdecks', () => {
    const result = fresh().handle({ action: 'deckNames' });
    expect(result.error).toBeNull();
    expect(result.result).toContain('Estudos::Anatomia');
    expect(result.result).toContain('Default');
  });

  it('filters by deck, state, tag and text', () => {
    const mock = fresh();
    const due = mock.handle({ action: 'findCards', params: { query: 'is:due' } }).result as number[];
    expect(due.length).toBeGreaterThan(0);
    const byDeck = mock.handle({ action: 'findCards', params: { query: 'deck:"Estudos::Anatomia"' } }).result as number[];
    expect(byDeck.length).toBe(2);
    const byTag = mock.handle({ action: 'findCards', params: { query: 'tag:farmacologia' } }).result as number[];
    expect(byTag.length).toBe(2);
    const byText = mock.handle({ action: 'findCards', params: { query: 'fêmur' } }).result as number[];
    expect(byText.length).toBe(1);
    const combined = mock.handle({ action: 'findCards', params: { query: 'deck:"Estudos::Anatomia" is:new' } }).result as number[];
    expect(combined.length).toBe(1);
  });

  it('supports the deck-tree semantics of deck queries', () => {
    const mock = fresh();
    const all = mock.handle({ action: 'findCards', params: { query: 'deck:Estudos' } }).result as number[];
    const sub = mock.handle({ action: 'findCards', params: { query: 'deck:"Estudos::Anatomia"' } }).result as number[];
    expect(all.length).toBeGreaterThan(sub.length);
  });

  it('creates decks idempotently and reports deck stats', () => {
    const mock = fresh();
    const first = mock.handle({ action: 'createDeck', params: { deck: 'Novo' } });
    const second = mock.handle({ action: 'createDeck', params: { deck: 'Novo' } });
    expect(first.result).toBe(second.result);
    const stats = mock.handle({ action: 'getDeckStats', params: { decks: ['Estudos::Anatomia'] } }).result as Record<string, { new_count: number; review_count: number }>;
    const entry = Object.values(stats)[0];
    expect(entry?.new_count).toBe(1);
    expect(entry?.review_count).toBe(1);
  });

  it('rejects duplicate notes unless allowDuplicate is set', () => {
    const mock = fresh();
    const note = { deckName: 'Default', modelName: 'Basic', fields: { Front: 'F', Back: 'B' }, options: { allowDuplicate: false }, tags: [] };
    const first = mock.handle({ action: 'addNote', params: { note } });
    expect(first.error).toBeNull();
    const dup = mock.handle({ action: 'addNote', params: { note } });
    expect(dup.error).toMatch(/duplicate/);
    const allowed = mock.handle({ action: 'addNote', params: { note: { ...note, options: { allowDuplicate: true } } } });
    expect(allowed.error).toBeNull();
  });

  it('validates models and field names', () => {
    const mock = fresh();
    const badModel = mock.handle({ action: 'addNote', params: { note: { deckName: 'Default', modelName: 'Nope', fields: { F: 'x' }, options: {} } } });
    expect(badModel.error).toMatch(/Model "Nope" not found/);
    const notes = mock.handle({ action: 'findNotes', params: { query: 'nid:1700000000001' } }).result as number[];
    const noteId = notes[0] as number;
    const badField = mock.handle({ action: 'updateNoteFields', params: { note: { id: noteId, fields: { Wrong: 'x' } } } });
    expect(badField.error).toMatch(/Field "Wrong" does not exist/);
  });

  it('requires cardsToo to delete non-empty decks', () => {
    const mock = fresh();
    const denied = mock.handle({ action: 'deleteDecks', params: { decks: ['Default'], cardsToo: false } });
    expect(denied.error).toMatch(/cardsToo/);
    const ok = mock.handle({ action: 'deleteDecks', params: { decks: ['Default'], cardsToo: true } });
    expect(ok.error).toBeNull();
  });

  it('answers cards with ease semantics and counts reviews', () => {
    const mock = fresh();
    const ids = mock.handle({ action: 'findCards', params: { query: 'is:due' } }).result as number[];
    const cardId = ids[0] as number;
    const answer = mock.handle({ action: 'answerCards', params: { answers: [{ cardId, ease: 3 }] } });
    expect(answer.result).toEqual([true]);
    const missing = mock.handle({ action: 'answerCards', params: { answers: [{ cardId: -1, ease: 3 }] } });
    expect(missing.result).toEqual([false]);
    expect(mock.handle({ action: 'getNumCardsReviewedToday' }).result).toBe(1);
    expect(mock.reviewedTodayCount).toBe(1);
  });

  it('supports failNextAction and API key enforcement', () => {
    const mock = fresh();
    mock.failNextAction('version', 'synthetic failure');
    expect(mock.handle({ action: 'version' }).error).toBe('synthetic failure');
    expect(mock.handle({ action: 'version' }).error).toBeNull();

    const secured = MockAnkiConnect.withSeed(seedCollection(), { apiKey: 'sekret' });
    expect(secured.handle({ action: 'version' }).error).toMatch(/Invalid API key/);
    expect(secured.handle({ action: 'version', key: 'sekret' }).error).toBeNull();
  });

  it('returns a typed error for unsupported actions', () => {
    const result = fresh().handle({ action: 'notAnAction' });
    expect(result.error).toBe('unsupported action "notAnAction"');
  });

  it('manages tags: add, remove, replace, clearUnused', () => {
    const mock = fresh();
    const noteIds = mock.handle({ action: 'findNotes', params: { query: 'nid:1700000000001' } }).result as number[];
    const noteId = noteIds[0] as number;
    mock.handle({ action: 'addTags', params: { notes: [noteId], tags: 'extra' } });
    let tags = mock.handle({ action: 'getTags' }).result as string[];
    expect(tags).toContain('extra');
    mock.handle({ action: 'replaceTags', params: { notes: [noteId], tag_to_replace: 'extra', replace_with_tag: 'renomeada' } });
    tags = mock.handle({ action: 'getTags' }).result as string[];
    expect(tags).toContain('renomeada');
    expect(tags).not.toContain('extra');
    mock.handle({ action: 'removeTags', params: { notes: [noteId], tags: ['renomeada'] } });
    tags = mock.handle({ action: 'getTags' }).result as string[];
    expect(tags).not.toContain('renomeada');
    const cleared = mock.handle({ action: 'clearUnusedTags' });
    expect(cleared.error).toBeNull();
  });

  it('updates models (templates and styling) and changeDeck moves cards', () => {
    const mock = fresh();
    const templates = mock.handle({ action: 'modelTemplates', params: { modelName: 'Basic' } }).result as Record<string, { Front: string; Back: string }>;
    expect(Object.keys(templates)).toEqual(['Card 1']);
    mock.handle({ action: 'updateModelTemplates', params: { model: { name: 'Basic', templates: { 'Card 1': { Front: 'NEW', Back: 'BACK' } } } } });
    const updated = mock.handle({ action: 'modelTemplates', params: { modelName: 'Basic' } }).result as Record<string, { Front: string }>;
    expect(updated['Card 1']?.Front).toBe('NEW');
    mock.handle({ action: 'updateModelStyling', params: { model: { name: 'Basic', css: '.card{}' } } });
    const styling = mock.handle({ action: 'modelStyling', params: { modelName: 'Basic' } }).result as { css: string };
    expect(styling.css).toBe('.card{}');

    const ids = mock.handle({ action: 'findCards', params: { query: 'is:new' } }).result as number[];
    mock.handle({ action: 'changeDeck', params: { cards: ids, deck: 'Destino' } });
    const moved = mock.handle({ action: 'findCards', params: { query: 'deck:Destino' } }).result as number[];
    expect(moved.length).toBe(ids.length);
  });

  it('returns notesInfo/cardsInfo shapes consumed by the adapters', () => {
    const mock = fresh();
    const notes = mock.handle({ action: 'findNotes', params: { query: 'tag:anatomia' } }).result as number[];
    const info = mock.handle({ action: 'notesInfo', params: { notes } }).result as Array<{ noteId: number; fields: Record<string, { value: string; order: number }> }>;
    expect(info.length).toBe(notes.length);
    expect(info[0]?.fields.Front?.value).toBeTruthy();
  });
});
