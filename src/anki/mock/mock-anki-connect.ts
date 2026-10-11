/**
 * Emulador in-memory do AnkiConnect API v6 para demo, testes e revisão da
 * OpenAI. Implementa o SUBconjunto de ações usado por este projeto, com
 * semântica simplificada documentada abaixo. NÃO é uma reimplementação
 * completa do AnkiConnect.
 *
 * Simplificações conscientes:
 * - Agendador: intervalos aproximados por ease (sem steps de learning/FSRS).
 * - Query de busca: deck:, is:(due|new|learn|review), tag:, nid:, cid: e
 *   busca textual por substring nos campos (sem OR, sem negação).
 * - Cloze: 1 cartão por nota (sem múltiplos c1/c2).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { MockSeed, MockSeedNote } from './seed.js';

interface MockNote {
  id: number;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  cards: number[];
  mod: number;
}

interface MockCard {
  id: number;
  noteId: number;
  deck: string;
  ord: number;
  type: number;
  queue: number;
  due: number;
  interval: number;
  reps: number;
  lapses: number;
  factor: number;
}

interface MockModel {
  name: string;
  fields: string[];
  templates: Record<string, { Front: string; Back: string }>;
  css: string;
}

interface ParsedQuery {
  deck?: string;
  states: Array<'due' | 'new' | 'learn' | 'review'>;
  tags: string[];
  noteIds: number[];
  cardIds: number[];
  texts: string[];
}

interface RequestRecord {
  action: string;
  key?: string;
  params: Record<string, unknown>;
}

export interface MockListenResult {
  url: string;
  close: () => Promise<void>;
}

function parseQuery(query: string): ParsedQuery {
  const tokens = query.match(/(?:[^\s"]+|"(?:[^"\\]|\\.)*")+/g) ?? [];
  const parsed: ParsedQuery = { states: [], tags: [], noteIds: [], cardIds: [], texts: [] };
  for (const raw of tokens) {
    const token = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    const colon = token.indexOf(':');
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase();
      const value = token
        .slice(colon + 1)
        .replace(/^"|"$/g, '')
        .replace(/\\(.)/g, '$1');
      if (key === 'deck') parsed.deck = value;
      else if (key === 'tag') parsed.tags.push(value);
      else if (key === 'nid') parsed.noteIds.push(Number(value));
      else if (key === 'cid') parsed.cardIds.push(Number(value));
      else if (key === 'is') {
        const state = value.toLowerCase();
        if (state === 'due' || state === 'new' || state === 'learn' || state === 'review') {
          parsed.states.push(state);
        }
      } else {
        parsed.texts.push(token);
      }
    } else if (token.length > 0) {
      parsed.texts.push(token);
    }
  }
  return parsed;
}

export class MockAnkiConnect {
  private readonly models = new Map<string, MockModel>();
  private readonly decks = new Map<string, number>();
  private readonly notes = new Map<number, MockNote>();
  private readonly cards = new Map<number, MockCard>();
  private readonly failQueue = new Map<string, string[]>();
  private readonly delays = new Map<string, number>();
  private nextId = 1_700_000_000_000;
  private nextDeckId = 1;
  private reviewedToday = 0;
  private apiKey?: string;
  private server?: Server;

  readonly requests: RequestRecord[] = [];

  constructor(seed?: MockSeed, options: { apiKey?: string } = {}) {
    this.apiKey = options.apiKey;
    if (seed) this.loadSeed(seed);
  }

  static withSeed(seed: MockSeed, options: { apiKey?: string } = {}): MockAnkiConnect {
    return new MockAnkiConnect(seed, options);
  }

  failNextAction(action: string, message: string): void {
    const queue = this.failQueue.get(action) ?? [];
    queue.push(message);
    this.failQueue.set(action, queue);
  }

  delayAction(action: string, ms: number): void {
    this.delays.set(action, ms);
  }

  get reviewedTodayCount(): number {
    return this.reviewedToday;
  }

  private loadSeed(seed: MockSeed): void {
    for (const model of seed.models) {
      this.models.set(model.name, {
        name: model.name,
        fields: [...model.fields],
        templates: model.templates ?? { 'Card 1': { Front: '{{Front}}', Back: '{{Back}}' } },
        css: model.css ?? '',
      });
    }
    for (const deckName of seed.decks) this.ensureDeck(deckName);
    for (const note of seed.notes) this.insertSeedNote(note);
  }

  private insertSeedNote(seed: MockSeedNote): void {
    this.ensureDeck(seed.deck);
    const noteId = this.allocateId();
    const cards: number[] = [];
    const cardSeeds = seed.cards ?? [{}];
    const templates = this.models.get(seed.model)?.templates ?? { 'Card 1': { Front: '', Back: '' } };
    const cardCount = Math.max(1, Math.min(Object.keys(templates).length, cardSeeds.length));
    for (let i = 0; i < cardCount; i += 1) {
      const spec = cardSeeds[i] ?? {};
      const cardId = this.allocateId();
      const suspended = spec.suspended === true;
      this.cards.set(cardId, {
        id: cardId,
        noteId,
        deck: seed.deck,
        ord: i,
        type: spec.type ?? 0,
        queue: suspended ? -1 : (spec.queue ?? 0),
        due: spec.due ?? 0,
        interval: spec.interval ?? 0,
        reps: spec.reps ?? 0,
        lapses: spec.lapses ?? 0,
        factor: 2500,
      });
      cards.push(cardId);
    }
    this.notes.set(noteId, {
      id: noteId,
      modelName: seed.model,
      fields: { ...seed.fields },
      tags: seed.tags ? [...seed.tags] : [],
      cards,
      mod: Math.floor(Date.now() / 1000),
    });
  }

  private allocateId(): number {
    this.nextId += 1;
    return this.nextId;
  }

  private ensureDeck(name: string): number {
    const existing = this.decks.get(name);
    if (existing !== undefined) return existing;
    // Like Anki: creating "Parent::Child" implicitly creates "Parent".
    const separator = name.lastIndexOf('::');
    if (separator > 0) this.ensureDeck(name.slice(0, separator));
    const id = this.nextDeckId;
    this.nextDeckId += 1;
    this.decks.set(name, id);
    return id;
  }

  private cardMatches(card: MockCard, note: MockNote, query: ParsedQuery): boolean {
    if (query.deck !== undefined) {
      if (card.deck !== query.deck && !card.deck.startsWith(`${query.deck}::`)) return false;
    }
    for (const state of query.states) {
      if (state === 'due' && !(card.due <= 0 && card.queue !== -1)) return false;
      if (state === 'new' && card.type !== 0) return false;
      if (state === 'learn' && card.type !== 1 && card.type !== 3) return false;
      if (state === 'review' && card.type !== 2) return false;
    }
    for (const tag of query.tags) {
      if (!note.tags.includes(tag)) return false;
    }
    if (query.noteIds.length > 0 && !query.noteIds.includes(note.id)) return false;
    if (query.cardIds.length > 0 && !query.cardIds.includes(card.id)) return false;
    if (query.texts.length > 0) {
      const haystack = Object.values(note.fields).join('\n').toLowerCase();
      for (const text of query.texts) {
        if (!haystack.includes(text.toLowerCase())) return false;
      }
    }
    return true;
  }

  private findMatchingCards(query: ParsedQuery): MockCard[] {
    const result: MockCard[] = [];
    for (const card of this.cards.values()) {
      const note = this.notes.get(card.noteId);
      if (note && this.cardMatches(card, note, query)) result.push(card);
    }
    return result.sort((a, b) => a.id - b.id);
  }

  private fieldValue(card: MockCard, note: MockNote): string {
    const values = Object.values(note.fields);
    return values[card.ord % Math.max(1, values.length)] ?? '';
  }

  private question(card: MockCard, note: MockNote): string {
    if (note.modelName === 'Cloze') return note.fields.Text ?? '';
    return note.fields.Front ?? this.fieldValue(card, note);
  }

  private answer(card: MockCard, note: MockNote): string {
    if (note.modelName === 'Cloze') return note.fields.Text ?? '';
    return note.fields.Back ?? '';
  }

  private cardInfoJson(card: MockCard): Record<string, unknown> {
    const note = this.notes.get(card.noteId);
    const fields: Record<string, { value: string; order: number }> = {};
    if (note) {
      let order = 0;
      for (const [name, value] of Object.entries(note.fields)) {
        fields[name] = { value, order: order += 1 };
      }
    }
    return {
      cardId: card.id,
      note: card.noteId,
      deckName: card.deck,
      modelName: note?.modelName ?? '',
      question: this.question(card, note as MockNote),
      answer: this.answer(card, note as MockNote),
      fields,
      fieldOrder: 1,
      ord: card.ord,
      factor: card.factor,
      interval: card.interval,
      due: card.due,
      reps: card.reps,
      lapses: card.lapses,
      left: 0,
      mod: note?.mod ?? 0,
      type: card.type,
      queue: card.queue,
    };
  }

  private noteInfoJson(note: MockNote): Record<string, unknown> {
    const fields: Record<string, { value: string; order: number }> = {};
    let order = 0;
    for (const [name, value] of Object.entries(note.fields)) {
      fields[name] = { value, order: order += 1 };
    }
    return { noteId: note.id, modelName: note.modelName, tags: [...note.tags], fields, cards: [...note.cards], mod: note.mod };
  }

  private deckCounts(deckName: string): { new_count: number; learn_count: number; review_count: number; total_in_deck: number } {
    let newCount = 0;
    let learnCount = 0;
    let reviewCount = 0;
    let total = 0;
    for (const card of this.cards.values()) {
      if (card.deck !== deckName && !card.deck.startsWith(`${deckName}::`)) continue;
      total += 1;
      if (card.type === 0) newCount += 1;
      else if (card.type === 1 || card.type === 3) learnCount += 1;
      else if (card.type === 2) reviewCount += 1;
    }
    return { new_count: newCount, learn_count: learnCount, review_count: reviewCount, total_in_deck: total };
  }

  private requireModel(name: string): MockModel {
    const model = this.models.get(name);
    if (!model) throw new Error(`Model "${name}" not found. Use create_note with an existing model name.`);
    return model;
  }

  private requireNote(id: number): MockNote {
    const note = this.notes.get(id);
    if (!note) throw new Error(`Note ${id} not found.`);
    return note;
  }

  private dispatch(action: string, params: Record<string, unknown>): unknown {
    switch (action) {
      case 'version':
        return 6;
      case 'deckNames':
        return [...this.decks.keys()].sort();
      case 'deckNamesAndIds': {
        const out: Record<string, number> = {};
        for (const name of [...this.decks.keys()].sort()) out[name] = this.ensureDeck(name);
        return out;
      }
      case 'getDeckStats': {
        const requested = (params.decks as string[] | undefined) ?? [];
        const out: Record<string, unknown> = {};
        for (const name of requested) {
          const id = this.decks.get(name);
          if (id === undefined) continue;
          out[String(id)] = { deck_id: id, name: name.split('::').pop() ?? name, ...this.deckCounts(name) };
        }
        return out;
      }
      case 'createDeck': {
        const name = String(params.deck);
        return this.ensureDeck(name);
      }
      case 'changeDeck': {
        const ids = (params.cards as number[] | undefined) ?? [];
        const deck = String(params.deck);
        this.ensureDeck(deck);
        for (const id of ids) {
          const card = this.cards.get(id);
          if (card) card.deck = deck;
        }
        return null;
      }
      case 'deleteDecks': {
        const names = (params.decks as string[] | undefined) ?? [];
        const cardsToo = params.cardsToo === true;
        for (const name of names) {
          const id = this.decks.get(name);
          if (id === undefined) continue;
          const hasCards = [...this.cards.values()].some((card) => card.deck === name);
          if (hasCards && !cardsToo) {
            throw new Error(`Deleting decks with cards requires "cardsToo" to be true (deck "${name}").`);
          }
          for (const [cardId, card] of [...this.cards.entries()]) {
            if (card.deck === name) this.cards.delete(cardId);
          }
          for (const note of this.notes.values()) {
            note.cards = note.cards.filter((cardId) => this.cards.has(cardId));
          }
          this.decks.delete(name);
        }
        return null;
      }
      case 'findCards': {
        const query = parseQuery(String(params.query ?? ''));
        return this.findMatchingCards(query).map((card) => card.id);
      }
      case 'cardsInfo': {
        const ids = (params.cards as number[] | undefined) ?? [];
        return ids.filter((id) => this.cards.has(id)).map((id) => this.cardInfoJson(this.cards.get(id) as MockCard));
      }
      case 'findNotes': {
        const query = parseQuery(String(params.query ?? ''));
        const matched = new Set<number>();
        for (const card of this.findMatchingCards(query)) matched.add(card.noteId);
        if (query.noteIds.length > 0) {
          for (const id of query.noteIds) if (this.notes.has(id)) matched.add(id);
        }
        return [...matched].sort((a, b) => a - b);
      }
      case 'notesInfo': {
        const ids = (params.notes as number[] | undefined) ?? [];
        return ids.filter((id) => this.notes.has(id)).map((id) => this.noteInfoJson(this.notes.get(id) as MockNote));
      }
      case 'addNote': {
        const note = params.note as {
          deckName: string;
          modelName: string;
          fields: Record<string, string>;
          options?: { allowDuplicate?: boolean };
          tags?: string[];
        };
        const model = this.requireModel(note.modelName);
        this.ensureDeck(note.deckName);
        const firstField = model.fields[0];
        if (!note.options?.allowDuplicate) {
          for (const existing of this.notes.values()) {
            if (
              existing.modelName === note.modelName &&
              firstField !== undefined &&
              existing.fields[firstField] === note.fields[firstField]
            ) {
              throw new Error('cannot create note because it is a duplicate');
            }
          }
        }
        const noteId = this.allocateId();
        const cardIds: number[] = [];
        const templates = Object.keys(model.templates);
        for (let ord = 0; ord < Math.max(1, templates.length); ord += 1) {
          const cardId = this.allocateId();
          this.cards.set(cardId, {
            id: cardId,
            noteId,
            deck: note.deckName,
            ord,
            type: 0,
            queue: 0,
            due: 0,
            interval: 0,
            reps: 0,
            lapses: 0,
            factor: 2500,
          });
          cardIds.push(cardId);
        }
        this.notes.set(noteId, {
          id: noteId,
          modelName: note.modelName,
          fields: { ...note.fields },
          tags: note.tags ? [...note.tags] : [],
          cards: cardIds,
          mod: Math.floor(Date.now() / 1000),
        });
        return noteId;
      }
      case 'updateNoteFields': {
        const input = params.note as { id: number; fields: Record<string, string> };
        const note = this.requireNote(input.id);
        const model = this.requireModel(note.modelName);
        for (const name of Object.keys(input.fields)) {
          if (!model.fields.includes(name)) {
            throw new Error(`Field "${name}" does not exist on model "${note.modelName}". Valid fields: ${model.fields.join(', ')}.`);
          }
        }
        Object.assign(note.fields, input.fields);
        return null;
      }
      case 'updateNoteTags': {
        const note = this.requireNote(Number(params.note));
        note.tags = ((params.tags as string[] | undefined) ?? []).map(String);
        return null;
      }
      case 'updateNoteModel': {
        const input = params.note as { id: number; modelName: string; fields: Record<string, string> };
        const note = this.requireNote(input.id);
        this.requireModel(input.modelName);
        note.modelName = input.modelName;
        note.fields = { ...input.fields };
        const tags = params.tags as string[] | undefined;
        if (tags) note.tags = [...tags];
        return null;
      }
      case 'deleteNotes': {
        const ids = (params.notes as number[] | undefined) ?? [];
        for (const id of ids) {
          const note = this.notes.get(id);
          if (!note) continue;
          for (const cardId of note.cards) this.cards.delete(cardId);
          this.notes.delete(id);
        }
        return null;
      }
      case 'getTags': {
        const tags = new Set<string>();
        for (const note of this.notes.values()) for (const tag of note.tags) tags.add(tag);
        return [...tags].sort();
      }
      case 'addTags': {
        const ids = (params.notes as number[] | undefined) ?? [];
        const tags = normalizeTags(params.tags);
        for (const id of ids) {
          const note = this.notes.get(id);
          if (!note) continue;
          for (const tag of tags) if (!note.tags.includes(tag)) note.tags.push(tag);
        }
        return null;
      }
      case 'removeTags': {
        const ids = (params.notes as number[] | undefined) ?? [];
        const tags = normalizeTags(params.tags);
        for (const id of ids) {
          const note = this.notes.get(id);
          if (!note) continue;
          note.tags = note.tags.filter((tag) => !tags.includes(tag));
        }
        return null;
      }
      case 'replaceTags': {
        const ids = (params.notes as number[] | undefined) ?? [];
        const from = String(params.tag_to_replace ?? '');
        const to = String(params.replace_with_tag ?? '');
        for (const id of ids) {
          const note = this.notes.get(id);
          if (!note) continue;
          note.tags = note.tags.map((tag) => (tag === from ? to : tag));
        }
        return null;
      }
      case 'clearUnusedTags': {
        const used = new Set<string>();
        for (const note of this.notes.values()) for (const tag of note.tags) used.add(tag);
        return null;
      }
      case 'answerCards': {
        const answers = (params.answers as Array<{ cardId: number; ease: number }> | undefined) ?? [];
        const results = answers.map(({ cardId, ease }) => {
          const card = this.cards.get(cardId);
          if (!card) return false;
          card.reps += 1;
          if (ease === 1 && card.type === 2) card.lapses += 1;
          const current = card.interval;
          const nextInterval =
            ease === 1 ? 0 : ease === 2 ? Math.max(1, Math.round(current * 1.2)) : ease === 3 ? Math.max(1, Math.round(current === 0 ? 1 : current * 2.5)) : Math.max(2, Math.round(current === 0 ? 2 : current * 4));
          card.interval = nextInterval;
          card.due = nextInterval;
          card.type = ease === 1 ? 1 : 2;
          card.queue = ease === 1 ? 1 : 2;
          this.reviewedToday += 1;
          return true;
        });
        return results;
      }
      case 'getNumCardsReviewedToday':
        return this.reviewedToday;
      case 'getCollectionStatsHTML':
        return '<html><body><h1>Estatísticas (coleção sintética de demonstração)</h1></body></html>';
      case 'modelNames':
        return [...this.models.keys()].sort();
      case 'modelFieldNames': {
        const model = this.requireModel(String(params.modelName));
        return [...model.fields];
      }
      case 'modelTemplates': {
        const model = this.requireModel(String(params.modelName));
        return model.templates;
      }
      case 'modelStyling': {
        const model = this.requireModel(String(params.modelName));
        return { css: model.css };
      }
      case 'updateModelTemplates': {
        const model = this.requireModel(String((params.model as { name: string }).name));
        const templates = (params.model as { templates: Record<string, { Front: string; Back: string }> }).templates;
        for (const [name, template] of Object.entries(templates)) {
          model.templates[name] = { Front: template.Front, Back: template.Back };
        }
        return null;
      }
      case 'updateModelStyling': {
        const model = this.requireModel(String((params.model as { name: string }).name));
        model.css = String((params.model as { css: string }).css);
        return null;
      }
      default:
        throw new Error(`unsupported action "${action}"`);
    }
  }

  /** Processes a raw AnkiConnect request body. Exposed for unit tests. */
  handle(body: { action?: unknown; params?: unknown; key?: unknown }): { result: unknown; error: string | null } {
    const action = typeof body.action === 'string' ? body.action : '';
    this.requests.push({ action, key: typeof body.key === 'string' ? body.key : undefined, params: (body.params as Record<string, unknown>) ?? {} });
    if (this.apiKey && body.key !== this.apiKey) {
      return { result: null, error: 'Invalid API key. Check the AnkiConnect add-on configuration.' };
    }
    const failures = this.failQueue.get(action);
    if (failures && failures.length > 0) {
      return { result: null, error: failures.shift() as string };
    }
    try {
      return { result: this.dispatch(action, (body.params as Record<string, unknown>) ?? {}), error: null };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  listen(port = 0): Promise<MockListenResult> {
    const server = createServer((req, res) => {
      void this.handleHttp(req, res);
    });
    this.server = server;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        resolve({
          url: `http://127.0.0.1:${actualPort}`,
          close: () =>
            new Promise<void>((done) => {
              server.closeAllConnections();
              server.close(() => done());
            }),
        });
      });
    });
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    let body: { action?: unknown; params?: unknown; key?: unknown };
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof body;
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: null, error: 'invalid JSON body' }));
      return;
    }
    const action = typeof body.action === 'string' ? body.action : '';
    const delay = this.delays.get(action);
    if (delay && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const response = this.handle(body);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  }

  close(): Promise<void> {
    const server = this.server;
    if (!server) return Promise.resolve();
    return new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
}

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string') return tags.split(/\s+/).filter(Boolean);
  return [];
}
