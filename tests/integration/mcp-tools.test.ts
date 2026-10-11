import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_SCOPES,
  callTool,
  mcpPost,
  obtainToken,
  startTestApp,
  type TestApp,
  type ToolCallResult,
} from '../helpers/test-app.js';

let app: TestApp;
let token: string;

beforeEach(async () => {
  app = await startTestApp();
  token = await obtainToken(app.baseUrl, { scope: ALL_SCOPES });
});

afterEach(async () => {
  await app.close();
});

function cards(result: ToolCallResult): Array<Record<string, unknown>> {
  return (result.structuredContent?.cards ?? []) as Array<Record<string, unknown>>;
}

async function firstDueCard(): Promise<Record<string, unknown>> {
  const due = await callTool(app.baseUrl, token, 'get_due_cards', { limit: 1 });
  const first = cards(due)[0];
  if (!first) throw new Error('expected at least one due card in the synthetic seed');
  return first;
}

describe('deck tools', () => {
  it('list_decks returns seeded decks with parents and subdecks', async () => {
    const result = await callTool(app.baseUrl, token, 'list_decks', {});
    expect(result.isError).toBe(false);
    const decks = (result.structuredContent?.decks ?? []) as Array<{ name: string; parent: string | null }>;
    const names = decks.map((deck) => deck.name);
    expect(names).toContain('Default');
    expect(names).toContain('Estudos');
    expect(names).toContain('Estudos::Anatomia');
    expect(decks.find((deck) => deck.name === 'Estudos::Anatomia')?.parent).toBe('Estudos');
  });

  it('get_deck returns stats and subdecks, and NOT_FOUND with a hint otherwise', async () => {
    const result = await callTool(app.baseUrl, token, 'get_deck', { name: 'Estudos' });
    expect(result.isError).toBe(false);
    expect(result.structuredContent?.subdecks).toEqual(['Estudos::Anatomia', 'Estudos::Farmacologia']);
    const stats = result.structuredContent?.stats as { total_in_deck: number };
    expect(stats.total_in_deck).toBeGreaterThanOrEqual(3);

    const missing = await callTool(app.baseUrl, token, 'get_deck', { name: 'Nope' });
    expect(missing.isError).toBe(true);
    expect(missing.payload?.code).toBe('NOT_FOUND');
    expect(String(missing.payload?.hint)).toContain('list_decks');
  });

  it('create_deck is idempotent and get_deck sees the new deck', async () => {
    const first = await callTool(app.baseUrl, token, 'create_deck', { name: 'Provas::Farmacologia' });
    const second = await callTool(app.baseUrl, token, 'create_deck', { name: 'Provas::Farmacologia' });
    expect(first.isError).toBe(false);
    const firstDeck = first.structuredContent?.deck as { id: number; parent: string | null };
    const secondDeck = second.structuredContent?.deck as { id: number };
    expect(firstDeck.parent).toBe('Provas');
    expect(secondDeck.id).toBe(firstDeck.id);
  });

  it('update_deck renames and moves cards', async () => {
    await callTool(app.baseUrl, token, 'create_deck', { name: 'Temporario' });
    await callTool(app.baseUrl, token, 'create_note', {
      deck: 'Temporario',
      model: 'Basic',
      fields: { Front: 'Pergunta temporária', Back: 'Resposta' },
    });
    const rename = await callTool(app.baseUrl, token, 'update_deck', { name: 'Temporario', new_name: 'Renomeado' });
    expect(rename.isError).toBe(false);
    expect(rename.structuredContent?.to).toBe('Renomeado');

    const search = await callTool(app.baseUrl, token, 'search_cards', { query: 'deck:Renomeado' });
    expect(cards(search)).toHaveLength(1);
    const old = await callTool(app.baseUrl, token, 'get_deck', { name: 'Temporario' });
    expect(old.payload?.code).toBe('NOT_FOUND');
  });

  it('update_deck reports CONFLICT for existing names and decks with subdecks', async () => {
    const existing = await callTool(app.baseUrl, token, 'update_deck', { name: 'Default', new_name: 'Estudos' });
    expect(existing.payload?.code).toBe('CONFLICT');

    const withSubdecks = await callTool(app.baseUrl, token, 'update_deck', { name: 'Estudos', new_name: 'EstudosNovo' });
    expect(withSubdecks.payload?.code).toBe('CONFLICT');
    expect(String(withSubdecks.payload?.message)).toContain('subdeck');
  });

  it('delete_deck requires confirm and deletes with it', async () => {
    const denied = await callTool(app.baseUrl, token, 'delete_deck', { name: 'Default', confirm: false });
    expect(denied.payload?.code).toBe('VALIDATION_ERROR');

    const deleted = await callTool(app.baseUrl, token, 'delete_deck', { name: 'Default', confirm: true });
    expect(deleted.isError).toBe(false);
    const check = await callTool(app.baseUrl, token, 'get_deck', { name: 'Default' });
    expect(check.payload?.code).toBe('NOT_FOUND');
  });
});

describe('card tools', () => {
  it('search_cards supports tag queries, limits and empty results', async () => {
    const result = await callTool(app.baseUrl, token, 'search_cards', { query: 'tag:farmacologia' });
    expect(result.isError).toBe(false);
    expect(result.structuredContent?.total).toBe(2);
    const found = cards(result);
    expect(found[0]?.tags).toContain('farmacologia');
    expect(String(found[0]?.answer)).toContain('Antagonismo');

    const limited = await callTool(app.baseUrl, token, 'search_cards', { query: 'is:due', limit: 1 });
    expect(limited.structuredContent?.total).toBeGreaterThan(1);
    expect(cards(limited)).toHaveLength(1);

    const empty = await callTool(app.baseUrl, token, 'search_cards', { query: 'inexistente-xyz' });
    expect(empty.structuredContent?.total).toBe(0);
    expect(cards(empty)).toHaveLength(0);
  });

  it('get_card returns card details and NOT_FOUND for missing ids', async () => {
    const due = await firstDueCard();
    const cardId = due.card_id as number;
    const result = await callTool(app.baseUrl, token, 'get_card', { card_id: cardId });
    expect(result.isError).toBe(false);
    expect(result.structuredContent?.card_id).toBe(cardId);
    expect(typeof result.structuredContent?.question).toBe('string');

    const missing = await callTool(app.baseUrl, token, 'get_card', { card_id: 42 });
    expect(missing.payload?.code).toBe('NOT_FOUND');
  });

  it('get_due_cards scopes by deck including subdecks', async () => {
    const all = await callTool(app.baseUrl, token, 'get_due_cards', {});
    expect(all.structuredContent?.total_due).toBeGreaterThanOrEqual(4);

    const scoped = await callTool(app.baseUrl, token, 'get_due_cards', { deck: 'Estudos::Anatomia' });
    expect(scoped.isError).toBe(false);
    for (const card of cards(scoped)) {
      expect(String(card.deck).startsWith('Estudos::Anatomia')).toBe(true);
    }
  });
});

describe('note tools', () => {
  it('create_note creates the deck if needed and rejects duplicates by default', async () => {
    const created = await callTool(app.baseUrl, token, 'create_note', {
      deck: 'NovoDeck',
      model: 'Basic',
      fields: { Front: 'Pergunta nova', Back: 'Resposta nova' },
      tags: ['criada'],
    });
    expect(created.isError).toBe(false);
    expect(typeof created.structuredContent?.note_id).toBe('number');

    const duplicate = await callTool(app.baseUrl, token, 'create_note', {
      deck: 'NovoDeck',
      model: 'Basic',
      fields: { Front: 'Pergunta nova', Back: 'Outra resposta' },
    });
    expect(duplicate.payload?.code).toBe('ANKI_ERROR');
    expect(String(duplicate.payload?.message)).toContain('duplicate');

    const allowed = await callTool(app.baseUrl, token, 'create_note', {
      deck: 'NovoDeck',
      model: 'Basic',
      fields: { Front: 'Pergunta nova', Back: 'Outra resposta' },
      allow_duplicate: true,
    });
    expect(allowed.isError).toBe(false);
  });

  it('create_note surfaces unknown models as ANKI_ERROR with guidance', async () => {
    const result = await callTool(app.baseUrl, token, 'create_note', {
      deck: 'Default',
      model: 'ModeloInexistente',
      fields: { Front: 'x' },
    });
    expect(result.payload?.code).toBe('ANKI_ERROR');
    expect(String(result.payload?.message)).toContain('ModeloInexistente');
    expect(result.payload?.hint).toBeTruthy();
  });

  it('update_note merges fields, replaces tags and validates input', async () => {
    const search = await callTool(app.baseUrl, token, 'search_cards', { query: 'tag:anatomia is:review' });
    const noteId = cards(search)[0]?.note_id as number;

    const updated = await callTool(app.baseUrl, token, 'update_note', {
      note_id: noteId,
      fields: { Back: 'Fêmur (atualizado).' },
      tags: ['anatomia', 'atualizado'],
    });
    expect(updated.isError).toBe(false);
    expect(updated.structuredContent?.updated_fields).toEqual(['Back']);
    expect(updated.structuredContent?.updated_tags).toBe(true);

    const verify = await callTool(app.baseUrl, token, 'search_cards', { query: 'tag:atualizado' });
    expect(cards(verify)).toHaveLength(1);
    expect(String(cards(verify)[0]?.answer)).toContain('atualizado');

    const noop = await callTool(app.baseUrl, token, 'update_note', { note_id: noteId });
    expect(noop.payload?.code).toBe('VALIDATION_ERROR');
  });

  it('update_note can change the model', async () => {
    const search = await callTool(app.baseUrl, token, 'search_cards', { query: 'tag:metodo' });
    const noteId = cards(search)[0]?.note_id as number;
    const updated = await callTool(app.baseUrl, token, 'update_note', { note_id: noteId, model: 'Cloze' });
    expect(updated.isError).toBe(false);
    expect(updated.structuredContent?.updated_model).toBe(true);
  });

  it('delete_note requires confirm and reports not_found ids', async () => {
    const created = await callTool(app.baseUrl, token, 'create_note', {
      deck: 'Default',
      model: 'Basic',
      fields: { Front: 'Para deletar', Back: 'x' },
    });
    const noteId = created.structuredContent?.note_id as number;

    const denied = await callTool(app.baseUrl, token, 'delete_note', { note_ids: [noteId], confirm: false });
    expect(denied.payload?.code).toBe('VALIDATION_ERROR');

    const deleted = await callTool(app.baseUrl, token, 'delete_note', { note_ids: [noteId, 999999], confirm: true });
    expect(deleted.isError).toBe(false);
    expect(deleted.structuredContent?.deleted).toEqual([noteId]);
    expect(deleted.structuredContent?.not_found).toEqual([999999]);
  });

  it('manage_tags lists, adds, removes, replaces and clears tags', async () => {
    const listed = await callTool(app.baseUrl, token, 'manage_tags', { action: 'list', tags: [] });
    expect(listed.isError).toBe(false);
    const allTags = listed.structuredContent?.tags as string[];
    expect(allTags).toContain('anatomia');

    const search = await callTool(app.baseUrl, token, 'search_cards', { query: 'tag:metodo' });
    const noteId = cards(search)[0]?.note_id as number;

    const added = await callTool(app.baseUrl, token, 'manage_tags', { action: 'add', tags: ['review'], note_ids: [noteId] });
    expect(added.structuredContent?.updated_note_ids).toEqual([noteId]);

    const replaced = await callTool(app.baseUrl, token, 'manage_tags', {
      action: 'replace',
      tags: [],
      note_ids: [noteId],
      replace_from: 'review',
      replace_to: 'revisado',
    });
    expect(replaced.isError).toBe(false);

    const removed = await callTool(app.baseUrl, token, 'manage_tags', { action: 'remove', tags: ['revisado'], note_ids: [noteId] });
    expect(removed.structuredContent?.updated_note_ids).toEqual([noteId]);

    const cleared = await callTool(app.baseUrl, token, 'manage_tags', { action: 'clear_unused' });
    expect(cleared.isError).toBe(false);
    expect(Array.isArray(cleared.structuredContent?.tags)).toBe(true);

    const invalid = await callTool(app.baseUrl, token, 'manage_tags', { action: 'add' });
    expect(invalid.payload?.code).toBe('VALIDATION_ERROR');
    const invalidReplace = await callTool(app.baseUrl, token, 'manage_tags', { action: 'replace', note_ids: [noteId] });
    expect(invalidReplace.payload?.code).toBe('VALIDATION_ERROR');
  });
});

describe('review tools', () => {
  it('submit_review answers a due card and increments reviewed_today', async () => {
    const due = await firstDueCard();
    const cardId = due.card_id as number;

    const result = await callTool(app.baseUrl, token, 'submit_review', { card_id: cardId, ease: 'good' });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ card_id: cardId, ease: 'good', answered: true });

    const stats = await callTool(app.baseUrl, token, 'get_stats', {});
    expect(stats.structuredContent?.reviewed_today).toBe(1);
  });

  it('submit_review maps unknown cards to NOT_FOUND', async () => {
    const result = await callTool(app.baseUrl, token, 'submit_review', { card_id: 1, ease: 'again' });
    expect(result.payload?.code).toBe('NOT_FOUND');
  });

  it('get_stats reports collection and deck-scoped counts', async () => {
    const collection = await callTool(app.baseUrl, token, 'get_stats', {});
    expect(collection.isError).toBe(false);
    const counts = collection.structuredContent?.counts as { due_count: number };
    expect(counts.due_count).toBeGreaterThanOrEqual(4);

    const deck = await callTool(app.baseUrl, token, 'get_stats', { deck: 'Estudos::Farmacologia' });
    expect(deck.structuredContent?.deck).toBe('Estudos::Farmacologia');
    expect(deck.structuredContent?.deck_stats).toBeTruthy();

    const unknownDeck = await callTool(app.baseUrl, token, 'get_stats', { deck: 'Inexistente' });
    expect(unknownDeck.isError).toBe(false);
    expect(unknownDeck.structuredContent?.deck_stats).toBeUndefined();
  });
});

describe('model template tool', () => {
  it('updates css and templates, validates inputs', async () => {
    const css = await callTool(app.baseUrl, token, 'update_model_templates', { model: 'Basic', css: '.card{color:red}' });
    expect(css.isError).toBe(false);
    expect(css.structuredContent?.css_updated).toBe(true);

    const template = await callTool(app.baseUrl, token, 'update_model_templates', {
      model: 'Basic',
      template_name: 'Card 1',
      front: '{{Front}}!',
    });
    expect(template.structuredContent?.templates_updated).toEqual(['Card 1']);

    const noChange = await callTool(app.baseUrl, token, 'update_model_templates', { model: 'Basic' });
    expect(noChange.payload?.code).toBe('VALIDATION_ERROR');

    const unknownModel = await callTool(app.baseUrl, token, 'update_model_templates', { model: 'Nope', css: 'x' });
    expect(unknownModel.payload?.code).toBe('NOT_FOUND');

    const unknownTemplate = await callTool(app.baseUrl, token, 'update_model_templates', {
      model: 'Basic',
      template_name: 'Nope',
      front: 'x',
    });
    expect(unknownTemplate.payload?.code).toBe('NOT_FOUND');
  });

  it('requires template_name when the model has multiple templates', async () => {
    await callTool(app.baseUrl, token, 'update_model_templates', {
      model: 'Basic',
      template_name: 'Card 1',
      front: 'A',
    });
    // Add a second template through the mock to exercise the multi-template branch.
    const raw = await fetch(app.mockUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'updateModelTemplates',
        version: 6,
        params: { model: { name: 'Basic', templates: { 'Card 2': { Front: 'F2', Back: 'B2' } } } },
      }),
    });
    expect(raw.status).toBe(200);

    const ambiguous = await callTool(app.baseUrl, token, 'update_model_templates', { model: 'Basic', front: 'x' });
    expect(ambiguous.payload?.code).toBe('VALIDATION_ERROR');
    expect(String(ambiguous.payload?.message)).toContain('template_name');
  });
});

describe('protocol-level behavior', () => {
  it('rejects unknown tools with an isError result naming the tool', async () => {
    const response = await mcpPost(app.baseUrl, token, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'not_a_tool', arguments: {} },
    });
    const body = response.body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
    expect(body.result?.isError).toBe(true);
    expect(String(body.result?.content?.[0]?.text)).toContain('not_a_tool');
  });

  it('returns framework validation errors for wrong argument types', async () => {
    const result = await callTool(app.baseUrl, token, 'get_card', { card_id: 'not-a-number' } as never);
    expect(result.isError).toBe(true);
    expect(String(result.payload?.message)).toContain('Invalid arguments');
  });

  it('keeps content text and structuredContent consistent', async () => {
    const result = await callTool(app.baseUrl, token, 'list_decks', {});
    expect(result.structuredContent).toEqual(result.payload);
  });

  it('enforces the rate limit with a RATE_LIMITED payload', async () => {
    await app.close();
    app = await startTestApp({ env: { RATE_LIMIT_PER_MINUTE: '2' } });
    token = await obtainToken(app.baseUrl);
    const first = await callTool(app.baseUrl, token, 'list_decks', {});
    const second = await callTool(app.baseUrl, token, 'list_decks', {});
    const third = await callTool(app.baseUrl, token, 'list_decks', {});
    expect(first.isError).toBe(false);
    expect(second.isError).toBe(false);
    expect(third.isError).toBe(true);
    expect(third.payload?.code).toBe('RATE_LIMITED');
    expect(String(third.payload?.message)).toContain('Retry in');
  });

  it('maps an unreachable AnkiConnect to ANKI_UNAVAILABLE with remediation', async () => {
    await app.close();
    app = await startTestApp({ env: { ANKI_CONNECT_URL: 'http://127.0.0.1:1', ANKI_TIMEOUT_MS: '500' } });
    token = await obtainToken(app.baseUrl);
    const result = await callTool(app.baseUrl, token, 'list_decks', {});
    expect(result.isError).toBe(true);
    expect(result.payload?.code).toBe('ANKI_UNAVAILABLE');
    expect(String(result.payload?.hint)).toContain('Anki Desktop');
  });
});
