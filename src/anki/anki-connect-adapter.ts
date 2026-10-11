import type {
  CardDetails,
  CardQueue,
  CardSummary,
  CardType,
  CollectionStats,
  CreateNoteInput,
  DeckConfigSummary,
  DeckDetails,
  DeckSummary,
  NoteDetails,
  ReviewEase,
  ReviewLogEntry,
  SubmitReviewResult,
  UpdateDeckInput,
  UpdateDeckResult,
  UpdateNoteInput,
} from '../domain/entities.js';
import { AnkiPluginError, createUnreachableError } from '../domain/errors.js';
import type { AnkiAdapter, AnkiHealthStatus, DueCardsResult, SearchCardsResult } from './adapter.js';
import { normalizeReviewRating } from './review.js';
import { computeDeckHierarchy, escapeAnkiTerm, stripHtmlPreview, validateAnkiSearchQuery } from './search.js';

export type JsonRpcTransport = (action: string, params?: Record<string, unknown>) => Promise<unknown>;

interface AnkiConnectEnvelope<T> {
  result: T;
  error: string | null;
}

interface RawDeckStat {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_in_deck: number;
}

interface RawDeckConfig {
  id: number;
  name: string;
  new?: { perDay?: number };
  rev?: { perDay?: number };
  maxTaken?: number;
}

interface RawFieldEntry {
  value: string;
  order: number;
}

interface RawCardInfo {
  cardId: number;
  note: number;
  deckName: string;
  modelName: string;
  question?: string;
  answer?: string;
  fields: Record<string, RawFieldEntry>;
  type: number;
  queue: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
  due: number;
}

interface RawNoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, RawFieldEntry>;
  cards: number[];
}

interface RawReviewEntry {
  id: number;
  usn?: number;
  ease: number;
  ivl: number;
  lastIvl: number;
  factor: number;
  time: number;
  type: number;
}

export interface AnkiConnectAdapterOptions {
  url: string;
  apiKey?: string;
  timeoutMs?: number;
  customTransport?: JsonRpcTransport;
  backendName?: string;
}

export class AnkiConnectAdapter implements AnkiAdapter {
  public readonly backendName: string;
  private readonly url: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly customTransport?: JsonRpcTransport;

  constructor(options: AnkiConnectAdapterOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.customTransport = options.customTransport;
    this.backendName = options.backendName ?? 'ankiconnect';
  }

  public async invokeRaw(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.customTransport) {
      return this.customTransport(action, params);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload: Record<string, unknown> = {
        action,
        version: 6,
        params,
      };
      if (this.apiKey) {
        payload.key = this.apiKey;
      }

      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw createUnreachableError(this.url, `HTTP ${response.status}`);
      }

      const body = (await response.json()) as AnkiConnectEnvelope<unknown>;
      if (body.error) {
        throw this.mapAnkiConnectError(action, body.error);
      }

      return body.result;
    } catch (err) {
      if (err instanceof AnkiPluginError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AnkiPluginError(
          'ANKI_TIMEOUT',
          `AnkiConnect request '${action}' timed out after ${this.timeoutMs}ms.`,
          'Verify that Anki Desktop is not frozen or in a modal dialog, and disable macOS App Nap for Anki.',
          true,
        );
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw createUnreachableError(this.url, detail);
    } finally {
      clearTimeout(timer);
    }
  }

  private mapAnkiConnectError(action: string, errorMessage: string): AnkiPluginError {
    const lower = errorMessage.toLowerCase();
    if (lower.includes('duplicate')) {
      return new AnkiPluginError(
        'DUPLICATE_NOTE',
        `AnkiConnect rejected duplicate note: ${errorMessage}`,
        'Set allowDuplicate=true if you intentionally want a duplicate note, or update the existing note with update_note.',
        false,
      );
    }
    if (lower.includes('model was not found') || lower.includes('model name')) {
      return new AnkiPluginError(
        'MODEL_NOT_FOUND',
        `Note model not found in Anki: ${errorMessage}`,
        'Use a standard model name like "Basic" or "Cloze".',
        false,
      );
    }
    if (lower.includes('deck was not found')) {
      return new AnkiPluginError(
        'DECK_NOT_FOUND',
        `Deck not found in Anki: ${errorMessage}`,
        'Call list_decks first to view valid deck names.',
        false,
      );
    }
    return new AnkiPluginError(
      'ANKI_API_ERROR',
      `AnkiConnect error in '${action}': ${errorMessage}`,
      'Check the parameters passed to the tool and ensure your Anki collection is unlocked.',
      false,
    );
  }

  private async call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await this.invokeRaw(action, params);
    return res as T;
  }

  public async checkHealth(): Promise<AnkiHealthStatus> {
    try {
      const version = await this.call<number>('version');
      return {
        backend: this.backendName,
        reachable: true,
        version,
      };
    } catch (err) {
      return {
        backend: this.backendName,
        reachable: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async listDecks(query?: string, includeStats = true): Promise<DeckSummary[]> {
    const namesAndIds = await this.call<Record<string, number>>('deckNamesAndIds');
    const allDeckNames = Object.keys(namesAndIds).sort((a, b) => a.localeCompare(b));
    const filteredNames = query
      ? allDeckNames.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()))
      : allDeckNames;

    let statsByName = new Map<string, RawDeckStat>();
    if (includeStats && filteredNames.length > 0) {
      try {
        const rawStats = await this.call<Record<string, RawDeckStat>>('getDeckStats', {
          decks: filteredNames,
        });
        statsByName = new Map(Object.values(rawStats).map((s) => [s.name, s]));
      } catch {
        // Fallback gracefully if getDeckStats is unavailable on an older AnkiConnect build
      }
    }

    return filteredNames.map((name) => {
      const id = namesAndIds[name] ?? 0;
      const stat = statsByName.get(name);
      const { parentName, depth } = computeDeckHierarchy(name);
      return {
        id,
        name,
        parentName,
        depth,
        newCount: stat?.new_count ?? 0,
        learnCount: stat?.learn_count ?? 0,
        dueCount: stat?.review_count ?? 0,
        totalCards: stat?.total_in_deck ?? 0,
      };
    });
  }

  public async getDeck(deckName: string, sampleLimit = 10): Promise<DeckDetails> {
    const namesAndIds = await this.call<Record<string, number>>('deckNamesAndIds');
    const deckId = namesAndIds[deckName];
    if (typeof deckId !== 'number') {
      throw new AnkiPluginError(
        'DECK_NOT_FOUND',
        `Deck '${deckName}' was not found in the Anki collection.`,
        'Call list_decks to see the exact names of all available decks.',
        false,
      );
    }

    const decks = await this.listDecks(undefined, true);
    const summary = decks.find((d) => d.name === deckName) ?? {
      id: deckId,
      name: deckName,
      ...computeDeckHierarchy(deckName),
      newCount: 0,
      learnCount: 0,
      dueCount: 0,
      totalCards: 0,
    };

    const prefix = `${deckName}::`;
    const subdecks = Object.keys(namesAndIds)
      .filter((name) => name.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));

    let config: DeckConfigSummary | null = null;
    try {
      const rawCfg = await this.call<RawDeckConfig>('getDeckConfig', { deck: deckName });
      if (rawCfg && typeof rawCfg.id === 'number') {
        config = {
          id: rawCfg.id,
          name: rawCfg.name,
          newPerDay: rawCfg.new?.perDay ?? 20,
          reviewsPerDay: rawCfg.rev?.perDay ?? 200,
          maxTakenSeconds: rawCfg.maxTaken,
        };
      }
    } catch {
      config = null;
    }

    let sampleCards: CardSummary[] = [];
    if (sampleLimit > 0) {
      const searchRes = await this.searchCards(`deck:${escapeAnkiTerm(deckName)}`, Math.min(sampleLimit, 50), 0);
      sampleCards = searchRes.cards;
    }

    return {
      ...summary,
      subdecks,
      config,
      sampleCards,
    };
  }

  public async createDeck(deckName: string): Promise<{ deckId: number; deckName: string; created: boolean }> {
    const trimmed = deckName.trim();
    if (!trimmed || trimmed.includes('::::') || trimmed.startsWith('::') || trimmed.endsWith('::')) {
      throw new AnkiPluginError(
        'INVALID_ARGUMENTS',
        `Invalid deck name '${deckName}'.`,
        'Use a non-empty deck name. For subdecks, separate levels with a single "::" such as "Languages::French".',
        false,
      );
    }

    const existing = await this.call<Record<string, number>>('deckNamesAndIds');
    const alreadyExists = typeof existing[trimmed] === 'number';
    const deckId = await this.call<number>('createDeck', { deck: trimmed });
    return {
      deckId,
      deckName: trimmed,
      created: !alreadyExists,
    };
  }

  public async updateDeck(input: UpdateDeckInput): Promise<UpdateDeckResult> {
    const sourceDeck = input.deckName.trim();
    const namesAndIds = await this.call<Record<string, number>>('deckNamesAndIds');

    if (!input.newName && (!input.cardIds || input.cardIds.length === 0)) {
      throw new AnkiPluginError(
        'INVALID_ARGUMENTS',
        'update_deck requires at least one of `newName` (to rename/migrate a deck) or `cardIds` (to move specific cards).',
        'Provide `newName` to rename the deck, or `cardIds: [123, 456]` to move cards into `deckName`.',
        false,
      );
    }

    // Case 1: Rename/migrate deck to newName
    if (input.newName && input.newName.trim()) {
      if (typeof namesAndIds[sourceDeck] !== 'number') {
        throw new AnkiPluginError(
          'DECK_NOT_FOUND',
          `Source deck '${sourceDeck}' does not exist.`,
          'Call list_decks first to verify the current deck name.',
          false,
        );
      }

      const targetDeckName = input.newName.trim();
      const { deckId } = await this.createDeck(targetDeckName);
      const cardIdsToMove =
        input.cardIds && input.cardIds.length > 0
          ? input.cardIds
          : await this.call<number[]>('findCards', { query: `deck:${escapeAnkiTerm(sourceDeck)}` });

      if (cardIdsToMove.length > 0) {
        await this.call('changeDeck', { cards: cardIdsToMove, deck: targetDeckName });
      }

      const shouldRemoveOld = input.removeOldDeck !== false && sourceDeck !== 'Default' && sourceDeck !== targetDeckName;
      if (shouldRemoveOld) {
        await this.call('deleteDecks', { decks: [sourceDeck], cardsToo: true });
      }

      return {
        deckName: sourceDeck,
        targetDeckName,
        movedCardsCount: cardIdsToMove.length,
        deckId,
        removedOldDeck: shouldRemoveOld,
      };
    }

    // Case 2: Move specified cardIds into deckName
    const created = await this.createDeck(sourceDeck);
    const cards = input.cardIds ?? [];
    await this.call('changeDeck', { cards, deck: sourceDeck });
    return {
      deckName: sourceDeck,
      targetDeckName: sourceDeck,
      movedCardsCount: cards.length,
      deckId: created.deckId,
      removedOldDeck: false,
    };
  }

  public async deleteDeck(deckName: string): Promise<{ deleted: true; deckName: string }> {
    const namesAndIds = await this.call<Record<string, number>>('deckNamesAndIds');
    if (typeof namesAndIds[deckName] !== 'number') {
      throw new AnkiPluginError(
        'DECK_NOT_FOUND',
        `Deck '${deckName}' was not found.`,
        'Call list_decks to verify existing decks before deleting.',
        false,
      );
    }

    await this.call('deleteDecks', { decks: [deckName], cardsToo: true });
    return { deleted: true, deckName };
  }

  private flattenFields(rawFields: Record<string, RawFieldEntry> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!rawFields) return out;
    const entries = Object.entries(rawFields).sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
    for (const [key, val] of entries) {
      out[key] = typeof val?.value === 'string' ? val.value : '';
    }
    return out;
  }

  private mapCardSummary(raw: RawCardInfo, tagsByNoteId: Map<number, string[]>, truncateFields = true): CardSummary {
    const fields = this.flattenFields(raw.fields);
    const fieldValues = Object.values(fields);
    const firstField = fieldValues[0] ?? raw.question ?? '';
    const secondField = fieldValues[1] ?? raw.answer ?? '';

    const processedFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      processedFields[k] = truncateFields ? stripHtmlPreview(v, 500) : v;
    }

    return {
      cardId: raw.cardId,
      noteId: raw.note,
      deckName: raw.deckName,
      modelName: raw.modelName,
      question: stripHtmlPreview(firstField, 280),
      answer: stripHtmlPreview(secondField, 280),
      fields: processedFields,
      tags: tagsByNoteId.get(raw.note) ?? [],
      type: (raw.type ?? 0) as CardType,
      queue: (raw.queue ?? 0) as CardQueue,
      interval: raw.interval ?? 0,
      factor: raw.factor ?? 0,
      reps: raw.reps ?? 0,
      lapses: raw.lapses ?? 0,
      due: raw.due ?? 0,
    };
  }

  private async hydrateCards(cardIds: number[], truncateFields = true): Promise<CardSummary[]> {
    if (cardIds.length === 0) return [];
    const rawCards = await this.call<RawCardInfo[]>('cardsInfo', { cards: cardIds });
    const validCards = (rawCards ?? []).filter((c) => c && typeof c.cardId === 'number');
    const noteIds = Array.from(new Set(validCards.map((c) => c.note).filter((n) => typeof n === 'number')));

    const tagsByNoteId = new Map<number, string[]>();
    if (noteIds.length > 0) {
      try {
        const rawNotes = await this.call<RawNoteInfo[]>('notesInfo', { notes: noteIds });
        for (const note of rawNotes ?? []) {
          if (note && typeof note.noteId === 'number') {
            tagsByNoteId.set(note.noteId, note.tags ?? []);
          }
        }
      } catch {
        // Ignore if notesInfo fails; tags default to []
      }
    }

    return validCards.map((c) => this.mapCardSummary(c, tagsByNoteId, truncateFields));
  }

  public async searchCards(query: string, limit = 25, offset = 0): Promise<SearchCardsResult> {
    const validatedQuery = validateAnkiSearchQuery(query);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safeOffset = Math.max(0, offset);

    const allCardIds = await this.call<number[]>('findCards', { query: validatedQuery });
    const total = allCardIds.length;
    const pageIds = allCardIds.slice(safeOffset, safeOffset + safeLimit);
    const cards = await this.hydrateCards(pageIds, true);

    return {
      query: validatedQuery,
      total,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: safeOffset + cards.length < total,
      cards,
    };
  }

  public async getCard(cardId: number, includeReviews = true): Promise<CardDetails> {
    const cards = await this.hydrateCards([cardId], false);
    const card = cards[0];
    if (!card) {
      throw new AnkiPluginError(
        'CARD_NOT_FOUND',
        `Card with ID ${cardId} was not found.`,
        'Use search_cards or get_due_cards to find valid card IDs.',
        false,
      );
    }

    let reviews: ReviewLogEntry[] = [];
    if (includeReviews) {
      try {
        const rawReviewsMap = await this.call<Record<string, RawReviewEntry[]>>('getReviewsOfCards', {
          cards: [cardId],
        });
        const list = rawReviewsMap?.[String(cardId)] ?? [];
        reviews = list.map((r) => ({
          id: r.id,
          cardId,
          ease: (r.ease >= 1 && r.ease <= 4 ? r.ease : 3) as ReviewEase,
          interval: r.ivl,
          lastInterval: r.lastIvl,
          factor: r.factor,
          timeMs: r.time,
          type: r.type,
        }));
      } catch {
        reviews = [];
      }
    }

    return {
      ...card,
      reviews,
    };
  }

  public async createNote(input: CreateNoteInput): Promise<{
    noteId: number;
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags: string[];
  }> {
    const cleanDeck = input.deckName.trim();
    const cleanModel = input.modelName.trim() || 'Basic';
    const fieldKeys = Object.keys(input.fields);
    if (fieldKeys.length === 0 || Object.values(input.fields).every((v) => !v || !v.trim())) {
      throw new AnkiPluginError(
        'INVALID_ARGUMENTS',
        'Cannot create a note with empty fields.',
        'Provide at least one non-empty field (e.g., `{ Front: "Question", Back: "Answer" }`).',
        false,
      );
    }

    if (input.createDeckIfMissing) {
      await this.createDeck(cleanDeck);
    }

    const noteId = await this.call<number | null>('addNote', {
      note: {
        deckName: cleanDeck,
        modelName: cleanModel,
        fields: input.fields,
        tags: input.tags,
        options: {
          allowDuplicate: input.allowDuplicate,
          duplicateScope: input.duplicateScope,
        },
      },
    });

    if (typeof noteId !== 'number') {
      throw new AnkiPluginError(
        'ANKI_API_ERROR',
        'AnkiConnect returned null when creating the note.',
        'Ensure the note fields match the selected modelName (e.g., Front and Back for Basic) and are not duplicates.',
        false,
      );
    }

    return {
      noteId,
      deckName: cleanDeck,
      modelName: cleanModel,
      fields: input.fields,
      tags: input.tags,
    };
  }

  public async updateNote(input: UpdateNoteInput): Promise<NoteDetails> {
    const hasFields = input.fields && Object.keys(input.fields).length > 0;
    const hasTagsReplace = Array.isArray(input.tags);
    const hasAddTags = Array.isArray(input.addTags) && input.addTags.length > 0;
    const hasRemoveTags = Array.isArray(input.removeTags) && input.removeTags.length > 0;

    if (!hasFields && !hasTagsReplace && !hasAddTags && !hasRemoveTags) {
      throw new AnkiPluginError(
        'INVALID_ARGUMENTS',
        'update_note requires at least one of `fields`, `tags`, `addTags`, or `removeTags`.',
        'Pass the fields or tag changes you want to apply to the note.',
        false,
      );
    }

    const existingList = await this.call<RawNoteInfo[]>('notesInfo', { notes: [input.noteId] });
    const existing = existingList?.[0];
    if (!existing || typeof existing.noteId !== 'number') {
      throw new AnkiPluginError(
        'NOTE_NOT_FOUND',
        `Note with ID ${input.noteId} was not found.`,
        'Use search_cards or get_card to inspect the noteId before calling update_note.',
        false,
      );
    }

    if (hasFields && input.fields) {
      await this.call('updateNoteFields', {
        note: {
          id: input.noteId,
          fields: input.fields,
        },
      });
    }

    if (hasTagsReplace && input.tags) {
      const currentTags = existing.tags ?? [];
      if (currentTags.length > 0) {
        await this.call('removeTags', { notes: [input.noteId], tags: currentTags.join(' ') });
      }
      if (input.tags.length > 0) {
        await this.call('addTags', { notes: [input.noteId], tags: input.tags.join(' ') });
      }
    } else {
      if (hasRemoveTags && input.removeTags) {
        await this.call('removeTags', { notes: [input.noteId], tags: input.removeTags.join(' ') });
      }
      if (hasAddTags && input.addTags) {
        await this.call('addTags', { notes: [input.noteId], tags: input.addTags.join(' ') });
      }
    }

    const updatedList = await this.call<RawNoteInfo[]>('notesInfo', { notes: [input.noteId] });
    const updated = updatedList?.[0] ?? existing;

    return {
      noteId: updated.noteId,
      modelName: updated.modelName,
      fields: this.flattenFields(updated.fields),
      tags: updated.tags ?? [],
      cards: updated.cards ?? [],
    };
  }

  public async deleteNotes(noteIds: number[]): Promise<{ deleted: true; deletedNoteIds: number[]; count: number }> {
    const uniqueIds = Array.from(new Set(noteIds));
    const existingList = await this.call<RawNoteInfo[]>('notesInfo', { notes: uniqueIds });
    const validIds = (existingList ?? []).filter((n) => n && typeof n.noteId === 'number').map((n) => n.noteId);

    if (validIds.length === 0) {
      throw new AnkiPluginError(
        'NOTE_NOT_FOUND',
        `None of the specified note IDs (${uniqueIds.join(', ')}) exist in the collection.`,
        'Use search_cards to locate existing noteIds before deleting.',
        false,
      );
    }

    await this.call('deleteNotes', { notes: validIds });
    return {
      deleted: true,
      deletedNoteIds: validIds,
      count: validIds.length,
    };
  }

  public async getDueCards(options?: {
    deckName?: string;
    tag?: string;
    includeNew?: boolean;
    limit?: number;
  }): Promise<DueCardsResult> {
    const safeLimit = Math.min(Math.max(1, options?.limit ?? 15), 100);
    const includeNew = options?.includeNew ?? true;

    const filterParts: string[] = [];
    if (options?.deckName) {
      filterParts.push(`deck:${escapeAnkiTerm(options.deckName)}`);
    }
    if (options?.tag) {
      filterParts.push(`tag:${escapeAnkiTerm(options.tag)}`);
    }
    const stateFilter = includeNew ? '(is:due OR is:new)' : 'is:due';
    filterParts.push(stateFilter);
    filterParts.push('-is:suspended');

    const query = filterParts.join(' ');
    const dueIds = await this.call<number[]>('findCards', { query });
    const selectedIds = dueIds.slice(0, safeLimit);
    const cards = await this.hydrateCards(selectedIds, false);

    return {
      deckName: options?.deckName ?? null,
      totalDue: dueIds.length,
      returnedCount: cards.length,
      cards,
    };
  }

  public async submitReview(cardId: number, easeInput: ReviewEase): Promise<SubmitReviewResult> {
    const { ease, label } = normalizeReviewRating(easeInput);
    const existing = await this.hydrateCards([cardId], false);
    if (!existing[0]) {
      throw new AnkiPluginError(
        'CARD_NOT_FOUND',
        `Card with ID ${cardId} was not found.`,
        'Call get_due_cards or search_cards to retrieve a valid cardId before submitting a review.',
        false,
      );
    }

    const results = await this.call<boolean[]>('answerCards', {
      answers: [{ cardId, ease }],
    });
    const success = Array.isArray(results) ? Boolean(results[0]) : true;
    const updatedList = await this.hydrateCards([cardId], false);
    const updatedCard = updatedList[0] ?? existing[0];

    return {
      cardId,
      ease,
      ratingLabel: label,
      success,
      updatedCard,
    };
  }

  public async getStats(options?: { deckName?: string; days?: number }): Promise<CollectionStats> {
    const days = Math.min(Math.max(1, options?.days ?? 7), 365);
    const deckFilter = options?.deckName ? `deck:${escapeAnkiTerm(options.deckName)} ` : '';

    const [decks, newIds, learnIds, reviewIds, dueIds, suspendedIds] = await Promise.all([
      this.listDecks(options?.deckName, true),
      this.call<number[]>('findCards', { query: `${deckFilter}is:new` }),
      this.call<number[]>('findCards', { query: `${deckFilter}is:learn` }),
      this.call<number[]>('findCards', { query: `${deckFilter}is:review` }),
      this.call<number[]>('findCards', { query: `${deckFilter}is:due` }),
      this.call<number[]>('findCards', { query: `${deckFilter}is:suspended` }),
    ]);

    let reviewedToday = 0;
    try {
      reviewedToday = await this.call<number>('getNumCardsReviewedToday');
    } catch {
      reviewedToday = 0;
    }

    let reviewsByDay: { date: string; count: number }[] = [];
    try {
      const rawByDay = await this.call<Array<[string, number]>>('getNumCardsReviewedByDay');
      reviewsByDay = (rawByDay ?? []).slice(0, days).map(([date, count]) => ({ date, count }));
    } catch {
      reviewsByDay = [];
    }

    const total = newIds.length + learnIds.length + reviewIds.length;

    return {
      deckName: options?.deckName ?? null,
      reviewedToday,
      reviewsByDay,
      totals: {
        new: newIds.length,
        learning: learnIds.length,
        review: reviewIds.length,
        due: dueIds.length,
        suspended: suspendedIds.length,
        total,
      },
      decks,
    };
  }
}
