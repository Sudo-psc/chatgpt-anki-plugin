import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { AnkiConnectAdapter } from '../../src/anki/anki-connect-adapter.js';
import { BridgeRelayAdapter } from '../../src/anki/bridge-adapter.js';
import { createAnkiAdapter } from '../../src/anki/index.js';
import { InMemoryAnkiAdapter } from '../../src/anki/memory-adapter.js';
import { loadConfig } from '../../src/infra/config.js';
import { formatToolError } from '../../src/tools/context.js';

describe('AnkiConnectAdapter, BridgeRelayAdapter & InMemoryAnkiAdapter (src/anki/*)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes AnkiConnect v6 JSON-RPC calls across all deck, note, card, review and stats operations', async () => {
    const decks: Record<string, number> = {
      Default: 1,
      'Medicina::Cardiologia': 2,
    };

    const transport = vi.fn(async (action: string, params?: Record<string, unknown>) => {
      switch (action) {
        case 'version':
          return 6;
        case 'deckNamesAndIds':
          return { ...decks };
        case 'getDeckStats':
          return {
            '1': { deck_id: 1, name: 'Default', new_count: 1, learn_count: 0, review_count: 2, total_in_deck: 3 },
            '2': {
              deck_id: 2,
              name: 'Medicina::Cardiologia',
              new_count: 2,
              learn_count: 1,
              review_count: 4,
              total_in_deck: 7,
            },
          };
        case 'getDeckConfig':
          return { id: 1, name: 'Default', new: { perDay: 20 }, rev: { perDay: 200 }, maxTaken: 60 };
        case 'createDeck': {
          const name = String(params?.deck ?? '');
          if (!decks[name]) decks[name] = Object.keys(decks).length + 1;
          return decks[name];
        }
        case 'changeDeck':
          return null;
        case 'deleteDecks': {
          const list = (params?.decks as string[]) ?? [];
          for (const d of list) delete decks[d];
          return null;
        }
        case 'findCards':
          return [5001];
        case 'cardsInfo':
          return [
            {
              cardId: 5001,
              note: 6001,
              deckName: 'Medicina::Cardiologia',
              modelName: 'Basic',
              fields: {
                Front: { value: '<b>Pergunta</b>', order: 0 },
                Back: { value: 'Resposta', order: 1 },
              },
              type: 2,
              queue: 2,
              interval: 15,
              factor: 2500,
              reps: 4,
              lapses: 0,
              due: 0,
            },
          ];
        case 'notesInfo': {
          const requested = (params?.notes as number[]) ?? [];
          if (requested.includes(999999)) return [];
          return [
            {
              noteId: 6001,
              modelName: 'Basic',
              tags: ['cardio'],
              fields: {
                Front: { value: 'Pergunta atualizada', order: 0 },
                Back: { value: 'Resposta atualizada', order: 1 },
              },
              cards: [5001],
            },
          ];
        }
        case 'addNote':
          return 6002;
        case 'updateNoteFields':
        case 'addTags':
        case 'removeTags':
        case 'deleteNotes':
          return null;
        case 'answerCards':
          return [true];
        case 'getReviewsOfCards':
          return {
            '5001': [{ id: 1, ease: 3, ivl: 15, lastIvl: 6, factor: 2500, time: 3500, type: 1 }],
          };
        case 'getNumCardsReviewedToday':
          return 9;
        case 'getNumCardsReviewedByDay':
          return [
            ['2026-10-10', 9],
            ['2026-10-09', 14],
          ];
        default:
          return null;
      }
    });

    const adapter = new AnkiConnectAdapter({
      url: 'http://127.0.0.1:8765',
      customTransport: transport,
    });

    expect((await adapter.checkHealth()).reachable).toBe(true);
    expect((await adapter.listDecks('Medicina', false)).length).toBe(1);
    expect((await adapter.getDeck('Medicina::Cardiologia', 0)).sampleCards).toHaveLength(0);
    await expect(adapter.getDeck('Inexistente')).rejects.toMatchObject({ code: 'DECK_NOT_FOUND' });

    await expect(adapter.createDeck('::::')).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    const createdDeck = await adapter.createDeck('Concursos::Direito');
    expect(createdDeck.created).toBe(true);
    const existingDeck = await adapter.createDeck('Default');
    expect(existingDeck.created).toBe(false);

    await expect(adapter.updateDeck({ deckName: 'Default' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    await expect(adapter.updateDeck({ deckName: 'Ghost', newName: 'Ghost2' })).rejects.toMatchObject({
      code: 'DECK_NOT_FOUND',
    });

    const movedDeck = await adapter.updateDeck({ deckName: 'Concursos::Direito', cardIds: [5001] });
    expect(movedDeck.movedCardsCount).toBe(1);

    const renamedDeck = await adapter.updateDeck({
      deckName: 'Concursos::Direito',
      newName: 'Concursos::Direito Constitucional',
    });
    expect(renamedDeck.targetDeckName).toBe('Concursos::Direito Constitucional');

    await expect(adapter.deleteDeck('GhostDeck')).rejects.toMatchObject({ code: 'DECK_NOT_FOUND' });
    const deletedDeck = await adapter.deleteDeck('Concursos::Direito Constitucional');
    expect(deletedDeck.deleted).toBe(true);

    const searchRes = await adapter.searchCards('deck:Medicina::Cardiologia', 10, 0);
    expect(searchRes.total).toBe(1);

    const cardDetails = await adapter.getCard(5001, false);
    expect(cardDetails.reviews).toHaveLength(0);

    await expect(
      adapter.createNote({
        deckName: 'Default',
        modelName: 'Basic',
        fields: { Front: '   ' },
        tags: [],
        allowDuplicate: false,
        duplicateScope: 'deck',
        createDeckIfMissing: false,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });

    const createdNote = await adapter.createNote({
      deckName: 'Default',
      modelName: 'Basic',
      fields: { Front: 'F', Back: 'B' },
      tags: ['t1'],
      allowDuplicate: false,
      duplicateScope: 'deck',
      createDeckIfMissing: true,
    });
    expect(createdNote.noteId).toBe(6002);

    await expect(adapter.updateNote({ noteId: 6001 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    await expect(adapter.updateNote({ noteId: 999999, fields: { Front: 'X' } })).rejects.toMatchObject({
      code: 'NOTE_NOT_FOUND',
    });

    const updatedNote = await adapter.updateNote({
      noteId: 6001,
      fields: { Front: 'Pergunta 2' },
      addTags: ['novo'],
      removeTags: ['antigo'],
    });
    expect(updatedNote.noteId).toBe(6001);

    const updatedNoteReplaceTags = await adapter.updateNote({
      noteId: 6001,
      tags: ['tag-unica'],
    });
    expect(updatedNoteReplaceTags.noteId).toBe(6001);

    await expect(adapter.deleteNotes([999999])).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' });
    const delNote = await adapter.deleteNotes([6001]);
    expect(delNote.count).toBe(1);

    const dueRes = await adapter.getDueCards({
      deckName: 'Medicina::Cardiologia',
      tag: 'cardio',
      includeNew: false,
      limit: 5,
    });
    expect(dueRes.returnedCount).toBe(1);

    const reviewRes = await adapter.submitReview(5001, 3);
    expect(reviewRes.success).toBe(true);

    const stats = await adapter.getStats({ deckName: 'Medicina::Cardiologia', days: 7 });
    expect(stats.reviewedToday).toBe(9);
    expect(stats.reviewsByDay).toHaveLength(2);

    // Exercise fallback branches when cardsInfo returns empty or addNote returns null
    transport.mockImplementationOnce(async () => []);
    await expect(adapter.getCard(404404)).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });

    transport.mockImplementationOnce(async () => []);
    await expect(adapter.submitReview(404404, 3)).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });

    transport.mockImplementationOnce(async () => ({ Default: 1 }));
    transport.mockImplementationOnce(async () => 1);
    transport.mockImplementationOnce(async () => null);
    await expect(
      adapter.createNote({
        deckName: 'Default',
        modelName: 'Basic',
        fields: { Front: 'X', Back: 'Y' },
        tags: [],
        allowDuplicate: true,
        duplicateScope: 'deck',
        createDeckIfMissing: true,
      }),
    ).rejects.toMatchObject({ code: 'ANKI_API_ERROR' });
  });

  it('maps HTTP fetch errors, AnkiConnect domain errors, and network failures accurately', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new AnkiConnectAdapter({
      url: 'http://127.0.0.1:8765',
      apiKey: 'secret-key',
      timeoutMs: 500,
    });

    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8765'));
    const health = await adapter.checkHealth();
    expect(health.reachable).toBe(false);

    // AbortError timeout
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortErr);
    await expect(adapter.listDecks()).rejects.toMatchObject({ code: 'ANKI_TIMEOUT' });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: null, error: 'cannot create note because it is a duplicate' }),
    });
    await expect(
      adapter.createNote({
        deckName: 'Default',
        modelName: 'Basic',
        fields: { Front: 'Dup', Back: 'Dup' },
        tags: [],
        allowDuplicate: false,
        duplicateScope: 'deck',
        createDeckIfMissing: false,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NOTE' });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: null, error: 'model was not found: UnknownModel' }),
    });
    await expect(
      adapter.createNote({
        deckName: 'Default',
        modelName: 'UnknownModel',
        fields: { Front: 'A', Back: 'B' },
        tags: [],
        allowDuplicate: true,
        duplicateScope: 'deck',
        createDeckIfMissing: false,
      }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: null, error: 'deck was not found: MissingDeck' }),
    });
    await expect(adapter.listDecks()).rejects.toMatchObject({ code: 'DECK_NOT_FOUND' });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: null, error: 'some generic ankiconnect failure' }),
    });
    await expect(adapter.listDecks()).rejects.toMatchObject({ code: 'ANKI_API_ERROR' });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
    });
    await expect(adapter.listDecks()).rejects.toMatchObject({ code: 'ANKI_UNREACHABLE' });

    // Non-AnkiPluginError formatting helper
    const formatted = formatToolError(new Error('unexpected runtime failure'));
    expect(formatted.errorCode).toBe('ANKI_API_ERROR');
  });

  it('exercises InMemoryAnkiAdapter branches (search operators, note updates, deck updates, reviews)', async () => {
    const mem = new InMemoryAnkiAdapter(true);
    expect((await mem.checkHealth()).reachable).toBe(true);
    expect((await mem.listDecks(undefined, false))[0]?.totalCards).toBe(0);

    await expect(mem.createDeck('::Invalid')).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    await expect(mem.updateDeck({ deckName: 'Default' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    await expect(mem.updateDeck({ deckName: 'Missing', newName: 'New' })).rejects.toMatchObject({
      code: 'DECK_NOT_FOUND',
    });

    const cards = (await mem.searchCards('deck:*')).cards;
    const firstCardId = cards[0]!.cardId;
    const firstNoteId = cards[0]!.noteId;

    const moved = await mem.updateDeck({ deckName: 'Default', cardIds: [firstCardId] });
    expect(moved.movedCardsCount).toBe(1);

    // Various search operators in InMemoryAnkiAdapter
    expect((await mem.searchCards('is:due')).total).toBeGreaterThanOrEqual(1);
    expect((await mem.searchCards('is:new')).total).toBeGreaterThanOrEqual(1);
    expect((await mem.searchCards('is:review')).total).toBeGreaterThanOrEqual(1);
    expect((await mem.searchCards('is:learn')).total).toBe(0);
    expect((await mem.searchCards('is:suspended')).total).toBe(0);
    expect((await mem.searchCards('prop:ivl>=10')).total).toBeGreaterThanOrEqual(1);
    expect((await mem.searchCards('prop:ivl<=100')).total).toBeGreaterThanOrEqual(1);
    expect((await mem.searchCards('prop:ivl>5')).total).toBeGreaterThanOrEqual(1);
    expect((await mem.searchCards('Front:*marcapasso*')).total).toBe(1);
    expect((await mem.searchCards('tag:none')).total).toBe(0);
    expect((await mem.searchCards('marcapasso')).total).toBe(1);

    // Note validations
    await expect(
      mem.createNote({
        deckName: 'Default',
        modelName: 'InvalidModel',
        fields: { Front: 'Q', Back: 'A' },
        tags: [],
        allowDuplicate: true,
        duplicateScope: 'deck',
        createDeckIfMissing: true,
      }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });

    await expect(
      mem.createNote({
        deckName: 'Default',
        modelName: 'Basic',
        fields: { Front: '   ' },
        tags: [],
        allowDuplicate: true,
        duplicateScope: 'deck',
        createDeckIfMissing: true,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });

    await expect(
      mem.createNote({
        deckName: 'NonExistentDeck',
        modelName: 'Basic',
        fields: { Front: 'UniqueQ', Back: 'UniqueA' },
        tags: [],
        allowDuplicate: true,
        duplicateScope: 'deck',
        createDeckIfMissing: false,
      }),
    ).rejects.toMatchObject({ code: 'DECK_NOT_FOUND' });

    // Tag replacement & removal on note
    const replacedTags = await mem.updateNote({
      noteId: firstNoteId,
      tags: ['tagA', 'tagB'],
    });
    expect(replacedTags.tags).toEqual(['tagA', 'tagB']);

    const modifiedTags = await mem.updateNote({
      noteId: firstNoteId,
      removeTags: ['tagA'],
      addTags: ['tagC'],
    });
    expect(modifiedTags.tags).toEqual(['tagB', 'tagC']);

    await expect(mem.updateNote({ noteId: 999999, tags: ['x'] })).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' });
    await expect(mem.deleteNotes([999999])).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' });
    await expect(mem.deleteDeck('MissingDeck')).rejects.toMatchObject({ code: 'DECK_NOT_FOUND' });

    // Submit review ratings 1, 2, 4
    await mem.submitReview(firstCardId, 1);
    await mem.submitReview(firstCardId, 2);
    await mem.submitReview(firstCardId, 4);
    await expect(mem.submitReview(999999, 3)).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });

  it('verifies BridgeRelayAdapter token and error handling when disconnected', async () => {
    const bridge = new BridgeRelayAdapter({ sharedToken: 'my-secret-bridge-token', timeoutMs: 300 });
    expect(bridge.verifyBridgeToken('my-secret-bridge-token')).toBe(true);
    expect(bridge.verifyBridgeToken('wrong')).toBe(false);
    expect(bridge.verifyBridgeToken(undefined)).toBe(false);

    const openBridge = new BridgeRelayAdapter({ timeoutMs: 120 });
    expect(openBridge.verifyBridgeToken(undefined)).toBe(true);

    const health = await bridge.checkHealth();
    expect(health.reachable).toBe(false);
    expect(health.bridgeConnected).toBe(false);

    await expect(bridge.listDecks()).rejects.toMatchObject({ code: 'ANKI_UNREACHABLE' });

    // Exercise attachSocket error response & disconnect cleanup
    const fakeWsHandlers = new Map<string, (...args: unknown[]) => void>();
    const fakeWs = {
      readyState: WebSocket.OPEN,
      on: (event: string, cb: (...args: unknown[]) => void) => {
        fakeWsHandlers.set(event, cb);
      },
      send: (payload: string, cb?: (err?: Error) => void) => {
        cb?.();
        const parsed = JSON.parse(payload) as { id: string; action: string };
        const msgHandler = fakeWsHandlers.get('message');
        if (parsed.action === 'version') {
          msgHandler?.(JSON.stringify({ type: 'anki_rpc_response', id: parsed.id, result: 6, error: null }));
        } else if (parsed.action === 'failAction') {
          msgHandler?.(JSON.stringify({ type: 'anki_rpc_response', id: parsed.id, error: 'bridge error' }));
        }
      },
      close: vi.fn(),
    } as unknown as WebSocket;

    openBridge.attachSocket(fakeWs);
    expect(openBridge.isBridgeConnected()).toBe(true);
    expect((await openBridge.checkHealth()).reachable).toBe(true);
    await expect(openBridge.invokeRaw('failAction')).rejects.toMatchObject({ code: 'ANKI_API_ERROR' });

    // Trigger socket close while a call is pending
    const pendingCall = openBridge.invokeRaw('hangingAction');
    fakeWsHandlers.get('close')?.();
    await expect(pendingCall).rejects.toMatchObject({ code: 'ANKI_UNREACHABLE' });

    const memCfg = loadConfig({ NODE_ENV: 'test', ANKI_BACKEND: 'memory' });
    expect(createAnkiAdapter(memCfg).adapter.backendName).toBe('memory');

    const bridgeCfg = loadConfig({ NODE_ENV: 'test', ANKI_BACKEND: 'bridge' });
    expect(createAnkiAdapter(bridgeCfg).adapter.backendName).toBe('bridge');

    const hybridCfg = loadConfig({ NODE_ENV: 'test', ANKI_BACKEND: 'ankiconnect' });
    expect(createAnkiAdapter(hybridCfg).adapter.backendName).toBe('ankiconnect');
    expect(WebSocket).toBeDefined();
  });
});
