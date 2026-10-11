import type {
  CardDetails,
  CardSummary,
  CollectionStats,
  CreateNoteInput,
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
import { AnkiPluginError } from '../domain/errors.js';
import type { AnkiAdapter, AnkiHealthStatus, DueCardsResult, SearchCardsResult } from './adapter.js';
import { computeNextCardSchedule, normalizeReviewRating } from './review.js';
import { computeDeckHierarchy, stripHtmlPreview, validateAnkiSearchQuery } from './search.js';

interface StoredNote {
  noteId: number;
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  cardIds: number[];
}

const SUPPORTED_MODELS = new Set(['Basic', 'Basic (and reversed card)', 'Cloze']);

/**
 * Deterministic in-memory Anki collection adapter used for:
 * 1. Automated contract, unit, integration, and E2E tests (no live Anki dependency);
 * 2. OpenAI App Review sandbox mode (`ANKI_BACKEND=memory`);
 * 3. Instant local evaluation.
 */
export class InMemoryAnkiAdapter implements AnkiAdapter {
  public readonly backendName = 'memory';
  private nextDeckId = 100;
  private nextNoteId = 2000;
  private nextCardId = 3000;
  private nextReviewId = 9000;
  private reviewedToday = 4;

  private readonly decks = new Map<string, number>();
  private readonly notes = new Map<number, StoredNote>();
  private readonly cards = new Map<number, CardSummary>();
  private readonly reviews = new Map<number, ReviewLogEntry[]>();

  constructor(seedDefaultData = true) {
    this.decks.set('Default', 1);
    if (seedDefaultData) {
      this.seedSyntheticCollection();
    }
  }

  private seedSyntheticCollection(): void {
    this.decks.set('Medicina::Cardiologia', 2);
    this.decks.set('Idiomas::Inglês', 3);

    this.insertNoteInternal({
      deckName: 'Medicina::Cardiologia',
      modelName: 'Basic',
      fields: {
        Front: 'Qual é o marcapasso fisiológico primário do coração humano?',
        Back: 'Nó sinoatrial (SA), localizado no átrio direito próximo à veia cava superior.',
      },
      tags: ['cardiologia', 'fisiologia'],
      type: 2,
      queue: 2,
      interval: 14,
      factor: 2500,
      reps: 5,
      lapses: 0,
      due: 0, // due today
    });

    this.insertNoteInternal({
      deckName: 'Medicina::Cardiologia',
      modelName: 'Basic',
      fields: {
        Front: 'Quais alterações clássicas de ECG caracterizam a fibrilação atrial?',
        Back: 'Ausência de ondas P distintas (ondas f fibrilatórias) e intervalos RR irregularmente irregulares.',
      },
      tags: ['cardiologia', 'ecg'],
      type: 0,
      queue: 0,
      interval: 0,
      factor: 2500,
      reps: 0,
      lapses: 0,
      due: 1,
    });

    this.insertNoteInternal({
      deckName: 'Idiomas::Inglês',
      modelName: 'Basic',
      fields: {
        Front: 'What does "ubiquitous" mean?',
        Back: 'Present, appearing, or found everywhere (onipresente).',
      },
      tags: ['vocabulary', 'english'],
      type: 2,
      queue: 2,
      interval: 21,
      factor: 2650,
      reps: 6,
      lapses: 1,
      due: 0,
    });
  }

  private insertNoteInternal(params: {
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags: string[];
    type: 0 | 1 | 2 | 3;
    queue: -1 | 0 | 1 | 2;
    interval: number;
    factor: number;
    reps: number;
    lapses: number;
    due: number;
  }): { noteId: number; cardId: number } {
    const noteId = ++this.nextNoteId;
    const cardId = ++this.nextCardId;
    const fieldValues = Object.values(params.fields);

    const card: CardSummary = {
      cardId,
      noteId,
      deckName: params.deckName,
      modelName: params.modelName,
      question: stripHtmlPreview(fieldValues[0] ?? '', 280),
      answer: stripHtmlPreview(fieldValues[1] ?? fieldValues[0] ?? '', 280),
      fields: { ...params.fields },
      tags: [...params.tags],
      type: params.type,
      queue: params.queue,
      interval: params.interval,
      factor: params.factor,
      reps: params.reps,
      lapses: params.lapses,
      due: params.due,
    };

    this.notes.set(noteId, {
      noteId,
      deckName: params.deckName,
      modelName: params.modelName,
      fields: { ...params.fields },
      tags: [...params.tags],
      cardIds: [cardId],
    });
    this.cards.set(cardId, card);
    this.reviews.set(cardId, []);
    return { noteId, cardId };
  }

  public async checkHealth(): Promise<AnkiHealthStatus> {
    return {
      backend: this.backendName,
      reachable: true,
      version: 6,
    };
  }

  private isCardInDeckOrSubdeck(cardDeck: string, targetDeck: string): boolean {
    return cardDeck === targetDeck || cardDeck.startsWith(`${targetDeck}::`);
  }

  public async listDecks(query?: string, includeStats = true): Promise<DeckSummary[]> {
    const names = Array.from(this.decks.keys()).sort((a, b) => a.localeCompare(b));
    const filtered = query ? names.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())) : names;

    return filtered.map((name) => {
      const id = this.decks.get(name) ?? 0;
      const { parentName, depth } = computeDeckHierarchy(name);
      if (!includeStats) {
        return { id, name, parentName, depth, newCount: 0, learnCount: 0, dueCount: 0, totalCards: 0 };
      }
      const deckCards = Array.from(this.cards.values()).filter((c) => this.isCardInDeckOrSubdeck(c.deckName, name));
      const newCount = deckCards.filter((c) => c.type === 0 && c.queue >= 0).length;
      const learnCount = deckCards.filter((c) => (c.type === 1 || c.type === 3) && c.queue >= 0).length;
      const dueCount = deckCards.filter((c) => c.type === 2 && c.due <= 0 && c.queue >= 0).length;
      return {
        id,
        name,
        parentName,
        depth,
        newCount,
        learnCount,
        dueCount,
        totalCards: deckCards.length,
      };
    });
  }

  public async getDeck(deckName: string, sampleLimit = 10): Promise<DeckDetails> {
    const id = this.decks.get(deckName);
    if (typeof id !== 'number') {
      throw new AnkiPluginError(
        'DECK_NOT_FOUND',
        `Deck '${deckName}' was not found in the Anki collection.`,
        'Call list_decks to see the exact names of all available decks.',
        false,
      );
    }

    const allSummaries = await this.listDecks(undefined, true);
    const summary = allSummaries.find((d) => d.name === deckName)!;
    const prefix = `${deckName}::`;
    const subdecks = Array.from(this.decks.keys())
      .filter((n) => n.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));

    const deckCards = Array.from(this.cards.values())
      .filter((c) => this.isCardInDeckOrSubdeck(c.deckName, deckName))
      .slice(0, Math.min(Math.max(0, sampleLimit), 50));

    return {
      ...summary,
      subdecks,
      config: {
        id: 1,
        name: 'Default',
        newPerDay: 20,
        reviewsPerDay: 200,
        maxTakenSeconds: 60,
      },
      sampleCards: deckCards,
    };
  }

  public async createDeck(deckName: string): Promise<{ deckId: number; deckName: string; created: boolean }> {
    const trimmed = deckName.trim();
    if (!trimmed || trimmed.includes('::::') || trimmed.startsWith('::') || trimmed.endsWith('::')) {
      throw new AnkiPluginError(
        'INVALID_ARGUMENTS',
        `Invalid deck name '${deckName}'.`,
        'Use a non-empty deck name. For subdecks, separate levels with a single "::".',
        false,
      );
    }

    // Ensure parent decks exist as well
    const parts = trimmed.split('::');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('::');
      if (!this.decks.has(parent)) {
        this.decks.set(parent, ++this.nextDeckId);
      }
    }

    const existing = this.decks.get(trimmed);
    if (typeof existing === 'number') {
      return { deckId: existing, deckName: trimmed, created: false };
    }

    const deckId = ++this.nextDeckId;
    this.decks.set(trimmed, deckId);
    return { deckId, deckName: trimmed, created: true };
  }

  public async updateDeck(input: UpdateDeckInput): Promise<UpdateDeckResult> {
    const sourceDeck = input.deckName.trim();
    if (!input.newName && (!input.cardIds || input.cardIds.length === 0)) {
      throw new AnkiPluginError(
        'INVALID_ARGUMENTS',
        'update_deck requires at least one of `newName` or `cardIds`.',
        'Provide `newName` to rename a deck or `cardIds` to move specific cards.',
        false,
      );
    }

    if (input.newName && input.newName.trim()) {
      if (!this.decks.has(sourceDeck)) {
        throw new AnkiPluginError(
          'DECK_NOT_FOUND',
          `Source deck '${sourceDeck}' does not exist.`,
          'Call list_decks first to verify the current deck name.',
          false,
        );
      }
      const targetDeckName = input.newName.trim();
      const { deckId } = await this.createDeck(targetDeckName);

      const targetCards =
        input.cardIds && input.cardIds.length > 0
          ? input.cardIds.map((id) => this.cards.get(id)).filter((c): c is CardSummary => Boolean(c))
          : Array.from(this.cards.values()).filter((c) => this.isCardInDeckOrSubdeck(c.deckName, sourceDeck));

      for (const card of targetCards) {
        card.deckName = targetDeckName;
        const note = this.notes.get(card.noteId);
        if (note) note.deckName = targetDeckName;
      }

      const shouldRemoveOld = input.removeOldDeck !== false && sourceDeck !== 'Default' && sourceDeck !== targetDeckName;
      if (shouldRemoveOld) {
        this.decks.delete(sourceDeck);
      }

      return {
        deckName: sourceDeck,
        targetDeckName,
        movedCardsCount: targetCards.length,
        deckId,
        removedOldDeck: shouldRemoveOld,
      };
    }

    const { deckId } = await this.createDeck(sourceDeck);
    let moved = 0;
    for (const cid of input.cardIds ?? []) {
      const card = this.cards.get(cid);
      if (card) {
        card.deckName = sourceDeck;
        const note = this.notes.get(card.noteId);
        if (note) note.deckName = sourceDeck;
        moved += 1;
      }
    }

    return {
      deckName: sourceDeck,
      targetDeckName: sourceDeck,
      movedCardsCount: moved,
      deckId,
      removedOldDeck: false,
    };
  }

  public async deleteDeck(deckName: string): Promise<{ deleted: true; deckName: string }> {
    if (!this.decks.has(deckName)) {
      throw new AnkiPluginError(
        'DECK_NOT_FOUND',
        `Deck '${deckName}' was not found.`,
        'Call list_decks to verify existing decks before deleting.',
        false,
      );
    }

    for (const name of Array.from(this.decks.keys())) {
      if (this.isCardInDeckOrSubdeck(name, deckName)) {
        this.decks.delete(name);
      }
    }
    for (const [cardId, card] of Array.from(this.cards.entries())) {
      if (this.isCardInDeckOrSubdeck(card.deckName, deckName)) {
        this.cards.delete(cardId);
        this.notes.delete(card.noteId);
        this.reviews.delete(cardId);
      }
    }

    return { deleted: true, deckName };
  }

  private matchesQuery(card: CardSummary, query: string): boolean {
    const q = query.trim();
    if (!q || q === 'deck:*' || q === '*') return true;

    // Extract tokens respecting quotes
    const tokens = q.match(/(?:[^\s"()]+|"[^"]*")+/g) ?? [];
    for (const rawToken of tokens) {
      if (rawToken.toUpperCase() === 'OR' || rawToken.toUpperCase() === 'AND') continue;
      const negated = rawToken.startsWith('-');
      const token = (negated ? rawToken.slice(1) : rawToken).replace(/^()+|()+$/g, '');
      const lower = token.toLowerCase();

      let matches = true;
      if (lower.startsWith('deck:')) {
        const deckVal = token.slice(5).replace(/^"|"$/g, '').toLowerCase();
        matches =
          deckVal === '*' ||
          card.deckName.toLowerCase() === deckVal ||
          card.deckName.toLowerCase().startsWith(`${deckVal}::`);
      } else if (lower.startsWith('tag:')) {
        const tagVal = token.slice(4).replace(/^"|"$/g, '').toLowerCase();
        matches = tagVal === 'none' ? card.tags.length === 0 : card.tags.some((t) => t.toLowerCase() === tagVal);
      } else if (lower === 'is:due') {
        matches = (card.type === 2 && card.due <= 0) || card.type === 1 || card.type === 3;
      } else if (lower === 'is:new') {
        matches = card.type === 0;
      } else if (lower === 'is:learn') {
        matches = card.type === 1 || card.type === 3;
      } else if (lower === 'is:review') {
        matches = card.type === 2;
      } else if (lower === 'is:suspended') {
        matches = card.queue === -1;
      } else if (lower.startsWith('prop:ivl>=')) {
        const n = Number(lower.slice('prop:ivl>='.length));
        matches = card.interval >= n;
      } else if (lower.startsWith('prop:ivl<=')) {
        const n = Number(lower.slice('prop:ivl<='.length));
        matches = card.interval <= n;
      } else if (lower.startsWith('prop:ivl>')) {
        const n = Number(lower.slice('prop:ivl>'.length));
        matches = card.interval > n;
      } else if (lower.includes(':')) {
        const [fieldKey, rawVal] = token.split(':', 2);
        const searchVal = (rawVal ?? '').replace(/^"|"$/g, '').replace(/\*/g, '').toLowerCase();
        const fieldMatch = Object.entries(card.fields).find(([k]) => k.toLowerCase() === (fieldKey ?? '').toLowerCase());
        matches = fieldMatch ? fieldMatch[1].toLowerCase().includes(searchVal) : false;
      } else {
        const clean = lower.replace(/^"|"$/g, '').replace(/\*/g, '');
        const haystack = `${card.deckName} ${card.tags.join(' ')} ${Object.values(card.fields).join(' ')}`.toLowerCase();
        matches = haystack.includes(clean);
      }

      if (negated ? matches : !matches) {
        // Special handling for `(is:due OR is:new)`
        if (q.includes('is:due OR is:new') && (lower === 'is:due' || lower === 'is:new')) {
          continue;
        }
        return false;
      }
    }

    if (q.includes('is:due OR is:new')) {
      const isDueOrNew = card.type === 0 || card.type === 1 || card.type === 3 || (card.type === 2 && card.due <= 0);
      if (!isDueOrNew) return false;
    }

    return true;
  }

  public async searchCards(query: string, limit = 25, offset = 0): Promise<SearchCardsResult> {
    const validatedQuery = validateAnkiSearchQuery(query);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safeOffset = Math.max(0, offset);

    const matched = Array.from(this.cards.values()).filter((c) => this.matchesQuery(c, validatedQuery));
    const page = matched.slice(safeOffset, safeOffset + safeLimit);

    return {
      query: validatedQuery,
      total: matched.length,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: safeOffset + page.length < matched.length,
      cards: page.map((c) => ({ ...c, fields: { ...c.fields }, tags: [...c.tags] })),
    };
  }

  public async getCard(cardId: number, includeReviews = true): Promise<CardDetails> {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new AnkiPluginError(
        'CARD_NOT_FOUND',
        `Card with ID ${cardId} was not found.`,
        'Use search_cards or get_due_cards to find valid card IDs.',
        false,
      );
    }

    return {
      ...card,
      fields: { ...card.fields },
      tags: [...card.tags],
      reviews: includeReviews ? [...(this.reviews.get(cardId) ?? [])] : [],
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

    if (!SUPPORTED_MODELS.has(cleanModel)) {
      throw new AnkiPluginError(
        'MODEL_NOT_FOUND',
        `Note model '${cleanModel}' was not found.`,
        'Use "Basic" or "Cloze".',
        false,
      );
    }

    const fieldValues = Object.values(input.fields);
    if (fieldValues.length === 0 || fieldValues.every((v) => !v || !v.trim())) {
      throw new AnkiPluginError(
        'INVALID_ARGUMENTS',
        'Cannot create a note with empty fields.',
        'Provide non-empty fields such as `{ Front: "Question", Back: "Answer" }`.',
        false,
      );
    }

    const firstFieldVal = (fieldValues[0] ?? '').trim().toLowerCase();
    if (!input.allowDuplicate) {
      for (const existing of this.notes.values()) {
        const sameScope = input.duplicateScope === 'collection' || existing.deckName === cleanDeck;
        const existingFirst = (Object.values(existing.fields)[0] ?? '').trim().toLowerCase();
        if (sameScope && existingFirst === firstFieldVal) {
          throw new AnkiPluginError(
            'DUPLICATE_NOTE',
            `A note with the same primary field already exists in ${input.duplicateScope}.`,
            'Set allowDuplicate=true or update the existing note with update_note.',
            false,
          );
        }
      }
    }

    if (input.createDeckIfMissing) {
      await this.createDeck(cleanDeck);
    } else if (!this.decks.has(cleanDeck)) {
      throw new AnkiPluginError(
        'DECK_NOT_FOUND',
        `Deck '${cleanDeck}' does not exist.`,
        'Create the deck first with create_deck or pass createDeckIfMissing=true.',
        false,
      );
    }

    const { noteId } = this.insertNoteInternal({
      deckName: cleanDeck,
      modelName: cleanModel,
      fields: input.fields,
      tags: input.tags,
      type: 0,
      queue: 0,
      interval: 0,
      factor: 2500,
      reps: 0,
      lapses: 0,
      due: 0,
    });

    return {
      noteId,
      deckName: cleanDeck,
      modelName: cleanModel,
      fields: { ...input.fields },
      tags: [...input.tags],
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

    const note = this.notes.get(input.noteId);
    if (!note) {
      throw new AnkiPluginError(
        'NOTE_NOT_FOUND',
        `Note with ID ${input.noteId} was not found.`,
        'Use search_cards to locate a valid noteId before calling update_note.',
        false,
      );
    }

    if (hasFields && input.fields) {
      note.fields = { ...note.fields, ...input.fields };
    }

    if (hasTagsReplace && input.tags) {
      note.tags = Array.from(new Set(input.tags));
    } else {
      const tagSet = new Set(note.tags);
      for (const t of input.removeTags ?? []) tagSet.delete(t);
      for (const t of input.addTags ?? []) tagSet.add(t);
      note.tags = Array.from(tagSet);
    }

    for (const cid of note.cardIds) {
      const card = this.cards.get(cid);
      if (card) {
        const vals = Object.values(note.fields);
        card.fields = { ...note.fields };
        card.tags = [...note.tags];
        card.question = stripHtmlPreview(vals[0] ?? '', 280);
        card.answer = stripHtmlPreview(vals[1] ?? vals[0] ?? '', 280);
      }
    }

    return {
      noteId: note.noteId,
      modelName: note.modelName,
      fields: { ...note.fields },
      tags: [...note.tags],
      cards: [...note.cardIds],
    };
  }

  public async deleteNotes(noteIds: number[]): Promise<{ deleted: true; deletedNoteIds: number[]; count: number }> {
    const deletedIds: number[] = [];
    for (const id of new Set(noteIds)) {
      const note = this.notes.get(id);
      if (note) {
        for (const cid of note.cardIds) {
          this.cards.delete(cid);
          this.reviews.delete(cid);
        }
        this.notes.delete(id);
        deletedIds.push(id);
      }
    }

    if (deletedIds.length === 0) {
      throw new AnkiPluginError(
        'NOTE_NOT_FOUND',
        `None of the specified note IDs (${noteIds.join(', ')}) exist.`,
        'Use search_cards to find valid noteIds.',
        false,
      );
    }

    return {
      deleted: true,
      deletedNoteIds: deletedIds,
      count: deletedIds.length,
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

    const allDue = Array.from(this.cards.values()).filter((card) => {
      if (card.queue < 0) return false;
      if (options?.deckName && !this.isCardInDeckOrSubdeck(card.deckName, options.deckName)) return false;
      if (options?.tag && !card.tags.some((t) => t.toLowerCase() === options.tag!.toLowerCase())) return false;
      const isDue = (card.type === 2 && card.due <= 0) || card.type === 1 || card.type === 3;
      const isNew = card.type === 0;
      return includeNew ? isDue || isNew : isDue;
    });

    const selected = allDue.slice(0, safeLimit);
    return {
      deckName: options?.deckName ?? null,
      totalDue: allDue.length,
      returnedCount: selected.length,
      cards: selected.map((c) => ({ ...c, fields: { ...c.fields }, tags: [...c.tags] })),
    };
  }

  public async submitReview(cardId: number, easeInput: ReviewEase): Promise<SubmitReviewResult> {
    const { ease, label } = normalizeReviewRating(easeInput);
    const card = this.cards.get(cardId);
    if (!card) {
      throw new AnkiPluginError(
        'CARD_NOT_FOUND',
        `Card with ID ${cardId} was not found.`,
        'Use get_due_cards or search_cards to obtain a valid cardId.',
        false,
      );
    }

    const updated = computeNextCardSchedule(card, ease);
    this.cards.set(cardId, updated);
    this.reviewedToday += 1;

    const logList = this.reviews.get(cardId) ?? [];
    logList.push({
      id: ++this.nextReviewId,
      cardId,
      ease,
      interval: updated.interval,
      lastInterval: card.interval,
      factor: updated.factor,
      timeMs: 4200,
      type: updated.type,
    });
    this.reviews.set(cardId, logList);

    return {
      cardId,
      ease,
      ratingLabel: label,
      success: true,
      updatedCard: { ...updated, fields: { ...updated.fields }, tags: [...updated.tags] },
    };
  }

  public async getStats(options?: { deckName?: string; days?: number }): Promise<CollectionStats> {
    const days = Math.min(Math.max(1, options?.days ?? 7), 365);
    const decks = await this.listDecks(options?.deckName, true);
    const relevantCards = Array.from(this.cards.values()).filter((c) =>
      options?.deckName ? this.isCardInDeckOrSubdeck(c.deckName, options.deckName) : true,
    );

    const newCount = relevantCards.filter((c) => c.type === 0 && c.queue >= 0).length;
    const learnCount = relevantCards.filter((c) => (c.type === 1 || c.type === 3) && c.queue >= 0).length;
    const reviewCount = relevantCards.filter((c) => c.type === 2 && c.queue >= 0).length;
    const dueCount = relevantCards.filter(
      (c) => ((c.type === 2 && c.due <= 0) || c.type === 1 || c.type === 3) && c.queue >= 0,
    ).length;
    const suspendedCount = relevantCards.filter((c) => c.queue === -1).length;

    const today = new Date();
    const reviewsByDay: { date: string; count: number }[] = [];
    for (let i = 0; i < Math.min(days, 7); i++) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const dateStr = d.toISOString().slice(0, 10);
      reviewsByDay.push({
        date: dateStr,
        count: i === 0 ? this.reviewedToday : Math.max(0, 12 - i * 2),
      });
    }

    return {
      deckName: options?.deckName ?? null,
      reviewedToday: this.reviewedToday,
      reviewsByDay,
      totals: {
        new: newCount,
        learning: learnCount,
        review: reviewCount,
        due: dueCount,
        suspended: suspendedCount,
        total: relevantCards.length,
      },
      decks,
    };
  }
}
