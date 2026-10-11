import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { InMemoryAnkiAdapter } from '../../src/anki/memory-adapter.js';
import { loadConfig } from '../../src/infra/config.js';
import { createMcpServerInstance } from '../../src/mcp/server.js';
import { ALL_OAUTH_SCOPES, REGISTERED_TOOL_NAMES } from '../../src/tools/index.js';

async function createConnectedTestPair(options?: {
  readOnly?: boolean;
  scopes?: ReadonlySet<string>;
}) {
  const anki = new InMemoryAnkiAdapter(true);
  const config = loadConfig({
    NODE_ENV: 'test',
    ANKI_BACKEND: 'memory',
    ANKI_READ_ONLY: options?.readOnly ? '1' : '0',
  });
  const server = createMcpServerInstance({
    anki,
    config,
    grantedScopes: options?.scopes ?? new Set(ALL_OAUTH_SCOPES),
  });

  const client = new Client({ name: 'contract-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server, anki };
}

describe('MCP Tools Contract Suite — C5 & C6 (`tests/contract/tools.contract.test.ts`)', () => {
  it('registers all 13 required tools with valid JSON Schema, descriptions, and annotations', async () => {
    const { client, server } = await createConnectedTestPair();
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name);
    for (const expectedName of REGISTERED_TOOL_NAMES) {
      expect(names).toContain(expectedName);
    }
    expect(tools).toHaveLength(13);

    for (const tool of tools) {
      expect(tool.description && tool.description.length > 15).toBe(true);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations?.readOnlyHint).toBe('boolean');
      expect(typeof tool.annotations?.destructiveHint).toBe('boolean');
      expect(typeof tool.annotations?.idempotentHint).toBe('boolean');
      expect(tool.annotations?.openWorldHint).toBe(false);
    }

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual([
      'ui://widget/deck-browser.html',
      'ui://widget/review-session.html',
    ]);

    await client.close();
    await server.close();
  });

  it('executes happy-path and structured error contracts for all 13 tools', async () => {
    const { client, server } = await createConnectedTestPair();

    // 1. list_decks
    const listRes = await client.callTool({ name: 'list_decks', arguments: {} });
    expect(listRes.isError).toBeFalsy();
    const listStruct = listRes.structuredContent as { totalDecks: number; decks: Array<{ name: string }> };
    expect(listStruct.totalDecks).toBeGreaterThanOrEqual(3);

    // 2. get_deck (happy + not found)
    const getDeckRes = await client.callTool({
      name: 'get_deck',
      arguments: { deckName: 'Medicina::Cardiologia', sampleLimit: 5 },
    });
    expect(getDeckRes.isError).toBeFalsy();

    const getDeckErr = await client.callTool({
      name: 'get_deck',
      arguments: { deckName: 'Deck::Inexistente' },
    });
    expect(getDeckErr.isError).toBe(true);
    expect((getDeckErr.structuredContent as { error: { code: string } }).error.code).toBe('DECK_NOT_FOUND');

    // 3. create_deck (idempotent)
    const createDeck1 = await client.callTool({
      name: 'create_deck',
      arguments: { deckName: 'Concursos::Direito Constitucional' },
    });
    expect((createDeck1.structuredContent as { created: boolean }).created).toBe(true);

    const createDeck2 = await client.callTool({
      name: 'create_deck',
      arguments: { deckName: 'Concursos::Direito Constitucional' },
    });
    expect((createDeck2.structuredContent as { created: boolean }).created).toBe(false);

    // 4. create_note (happy + duplicate check)
    const createNoteRes = await client.callTool({
      name: 'create_note',
      arguments: {
        deckName: 'Concursos::Direito Constitucional',
        modelName: 'Basic',
        fields: {
          Front: 'Quais são os fundamentos da República Federativa do Brasil (art. 1º CF)?',
          Back: 'SO-CI-DI-VA-PLU: Soberania, Cidadania, Dignidade da pessoa humana, Valores sociais do trabalho e da livre iniciativa, Pluralismo político.',
        },
        tags: ['cf88', 'fundamentos'],
      },
    });
    expect(createNoteRes.isError).toBeFalsy();
    const createdNoteId = (createNoteRes.structuredContent as { noteId: number }).noteId;
    expect(createdNoteId).toBeGreaterThan(0);

    const dupNoteRes = await client.callTool({
      name: 'create_note',
      arguments: {
        deckName: 'Concursos::Direito Constitucional',
        modelName: 'Basic',
        fields: {
          Front: 'Quais são os fundamentos da República Federativa do Brasil (art. 1º CF)?',
          Back: 'Duplicado',
        },
      },
    });
    expect(dupNoteRes.isError).toBe(true);
    expect((dupNoteRes.structuredContent as { error: { code: string } }).error.code).toBe('DUPLICATE_NOTE');

    // 5. search_cards (happy + invalid query)
    const searchRes = await client.callTool({
      name: 'search_cards',
      arguments: { query: 'tag:cf88', limit: 10, offset: 0 },
    });
    expect(searchRes.isError).toBeFalsy();
    const searchedCards = (searchRes.structuredContent as { cards: Array<{ cardId: number; noteId: number }> }).cards;
    expect(searchedCards).toHaveLength(1);
    const createdCardId = searchedCards[0]!.cardId;

    const badSearch = await client.callTool({
      name: 'search_cards',
      arguments: { query: 'deck:"Unclosed quote' },
    });
    expect(badSearch.isError).toBe(true);
    expect((badSearch.structuredContent as { error: { code: string } }).error.code).toBe('INVALID_SEARCH_QUERY');

    // 6. get_card (happy + not found)
    const getCardRes = await client.callTool({
      name: 'get_card',
      arguments: { cardId: createdCardId, includeReviews: true },
    });
    expect(getCardRes.isError).toBeFalsy();

    const missingCard = await client.callTool({
      name: 'get_card',
      arguments: { cardId: 9999999 },
    });
    expect(missingCard.isError).toBe(true);
    expect((missingCard.structuredContent as { error: { code: string } }).error.code).toBe('CARD_NOT_FOUND');

    // 7. update_note (happy + invalid empty update)
    const updateNoteRes = await client.callTool({
      name: 'update_note',
      arguments: {
        noteId: createdNoteId,
        fields: { Back: 'SO-CI-DI-VA-PLU (Art. 1º da CF/88)' },
        addTags: ['revisado'],
      },
    });
    expect(updateNoteRes.isError).toBeFalsy();

    const emptyUpdateNote = await client.callTool({
      name: 'update_note',
      arguments: { noteId: createdNoteId },
    });
    expect(emptyUpdateNote.isError).toBe(true);
    expect((emptyUpdateNote.structuredContent as { error: { code: string } }).error.code).toBe('INVALID_ARGUMENTS');

    // 8. get_due_cards
    const dueRes = await client.callTool({
      name: 'get_due_cards',
      arguments: { deckName: 'Medicina::Cardiologia', limit: 10, includeNew: true },
    });
    expect(dueRes.isError).toBeFalsy();
    const dueCards = (dueRes.structuredContent as { cards: Array<{ cardId: number }> }).cards;
    expect(dueCards.length).toBeGreaterThan(0);

    // 9. submit_review
    const reviewRes = await client.callTool({
      name: 'submit_review',
      arguments: { cardId: dueCards[0]!.cardId, rating: 'good' },
    });
    expect(reviewRes.isError).toBeFalsy();
    expect((reviewRes.structuredContent as { ratingLabel: string }).ratingLabel).toBe('Good');

    // 10. get_stats (global + scoped to deckName)
    const statsRes = await client.callTool({
      name: 'get_stats',
      arguments: { days: 7 },
    });
    expect(statsRes.isError).toBeFalsy();
    expect((statsRes.structuredContent as { reviewedToday: number }).reviewedToday).toBeGreaterThanOrEqual(5);

    const scopedStatsRes = await client.callTool({
      name: 'get_stats',
      arguments: { deckName: 'Medicina::Cardiologia', days: 3 },
    });
    expect(scopedStatsRes.isError).toBeFalsy();

    // Global get_due_cards (no deckName) & create_note with no tags + update_note with empty tags
    const globalDueRes = await client.callTool({
      name: 'get_due_cards',
      arguments: { limit: 5 },
    });
    expect(globalDueRes.isError).toBeFalsy();

    const untaggedNoteRes = await client.callTool({
      name: 'create_note',
      arguments: {
        deckName: 'Default',
        fields: { Front: 'Nota sem tag', Back: 'Verso sem tag' },
      },
    });
    const untaggedNoteId = (untaggedNoteRes.structuredContent as { noteId: number }).noteId;
    await client.callTool({
      name: 'update_note',
      arguments: { noteId: untaggedNoteId, tags: [] },
    });

    // 11. update_deck (rename deck)
    const updateDeckRes = await client.callTool({
      name: 'update_deck',
      arguments: {
        deckName: 'Concursos::Direito Constitucional',
        newName: 'Concursos::Direito Público',
      },
    });
    expect(updateDeckRes.isError).toBeFalsy();
    expect((updateDeckRes.structuredContent as { movedCardsCount: number }).movedCardsCount).toBe(1);

    // 12. delete_note (requires confirm=true)
    const delNoteUnconfirmed = await client.callTool({
      name: 'delete_note',
      arguments: { noteIds: [createdNoteId], confirm: false },
    });
    expect(delNoteUnconfirmed.isError).toBe(true);
    expect((delNoteUnconfirmed.structuredContent as { error: { code: string } }).error.code).toBe(
      'CONFIRMATION_REQUIRED',
    );

    const delNoteConfirmed = await client.callTool({
      name: 'delete_note',
      arguments: { noteIds: [createdNoteId, untaggedNoteId], confirm: true },
    });
    expect(delNoteConfirmed.isError).toBeFalsy();

    // 13. delete_deck (protects Default & requires confirm=true)
    const delDeckUnconfirmed = await client.callTool({
      name: 'delete_deck',
      arguments: { deckName: 'Concursos::Direito Público', confirm: false },
    });
    expect(delDeckUnconfirmed.isError).toBe(true);

    const delDefault = await client.callTool({
      name: 'delete_deck',
      arguments: { deckName: 'Default', confirm: true },
    });
    expect(delDefault.isError).toBe(true);
    expect((delDefault.structuredContent as { error: { code: string } }).error.code).toBe('PROTECTED_DECK');

    const delDeckConfirmed = await client.callTool({
      name: 'delete_deck',
      arguments: { deckName: 'Concursos::Direito Público', confirm: true },
    });
    expect(delDeckConfirmed.isError).toBeFalsy();

    await client.close();
    await server.close();
  });

  it('blocks all write/review/delete tools when ANKI_READ_ONLY=1', async () => {
    const { client, server } = await createConnectedTestPair({ readOnly: true });

    const readRes = await client.callTool({ name: 'list_decks', arguments: {} });
    expect(readRes.isError).toBeFalsy();

    const writeRes = await client.callTool({
      name: 'create_deck',
      arguments: { deckName: 'Bloqueado' },
    });
    expect(writeRes.isError).toBe(true);
    expect((writeRes.structuredContent as { error: { code: string } }).error.code).toBe('READ_ONLY_MODE');

    await client.close();
    await server.close();
  });

  it('enforces OAuth scopes per operation (anki:read vs anki:write / anki:delete)', async () => {
    const { client, server } = await createConnectedTestPair({
      scopes: new Set(['anki:read']),
    });

    const allowedRead = await client.callTool({ name: 'list_decks', arguments: {} });
    expect(allowedRead.isError).toBeFalsy();

    const deniedWrite = await client.callTool({
      name: 'create_deck',
      arguments: { deckName: 'SemEscopo' },
    });
    expect(deniedWrite.isError).toBe(true);
    expect((deniedWrite.structuredContent as { error: { code: string } }).error.code).toBe('INSUFFICIENT_SCOPE');

    await client.close();
    await server.close();
  });
});
