import { parentOf } from '../domain/mappers.js';
import type { DeckDetails, DeckSummary } from '../domain/types.js';
import type { AnkiConnectClient } from './client.js';
import { AnkiConflictError, AnkiNotFoundError } from './errors.js';
import type { AnkiDeckStatsWire } from './wire-types.js';

/** Escapes a deck name for use inside an Anki search query. */
export function deckQuery(name: string): string {
  return `deck:"${name.replace(/"/g, '')}"`;
}

export class DecksAdapter {
  constructor(private readonly client: AnkiConnectClient) {}

  async list(): Promise<DeckSummary[]> {
    const map = await this.client.invoke<Record<string, number>>('deckNamesAndIds');
    return Object.entries(map)
      .map(([name, id]) => ({ id, name, parent: parentOf(name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<DeckDetails> {
    const decks = await this.list();
    const deck = decks.find((item) => item.name === name);
    if (!deck) {
      throw new AnkiNotFoundError(`Deck "${name}" does not exist. Use list_decks to see available decks.`);
    }
    const statsMap = await this.client.invoke<Record<string, AnkiDeckStatsWire>>('getDeckStats', {
      decks: [name],
    });
    const stats = Object.values(statsMap).find((item) => item.name === name) ?? null;
    const subdecks = decks.filter((item) => item.name.startsWith(`${name}::`)).map((item) => item.name);
    return {
      ...deck,
      subdecks,
      stats: stats
        ? {
            newCount: stats.new_count,
            learnCount: stats.learn_count,
            reviewCount: stats.review_count,
            totalInDeck: stats.total_in_deck,
          }
        : null,
    };
  }

  /**
   * AnkiConnect has no "renameDeck" action, so renames are composed:
   * create the target deck, move all cards, delete the (now empty) source.
   * Decks with subdecks are rejected to avoid orphaning child decks.
   */
  async rename(oldName: string, newName: string): Promise<void> {
    const decks = await this.list();
    if (!decks.some((item) => item.name === oldName)) {
      throw new AnkiNotFoundError(`Deck "${oldName}" does not exist. Use list_decks to see available decks.`);
    }
    if (decks.some((item) => item.name === newName)) {
      throw new AnkiConflictError(`A deck named "${newName}" already exists. Choose another name.`);
    }
    const subdecks = decks.filter((item) => item.name.startsWith(`${oldName}::`));
    if (subdecks.length > 0) {
      throw new AnkiConflictError(
        `Deck "${oldName}" has subdecks (${subdecks.map((item) => item.name).join(', ')}); renaming decks with subdecks is not supported by AnkiConnect. Rename or move the subdecks first.`,
      );
    }
    await this.client.invoke<number>('createDeck', { deck: newName });
    const cardIds = await this.client.invoke<number[]>('findCards', { query: deckQuery(oldName) });
    if (cardIds.length > 0) {
      await this.client.invoke<null>('changeDeck', { cards: cardIds, deck: newName });
    }
    await this.client.invoke<null>('deleteDecks', { decks: [oldName], cardsToo: true });
  }

  async create(name: string): Promise<DeckSummary> {
    const id = await this.client.invoke<number>('createDeck', { deck: name });
    return { id, name, parent: parentOf(name) };
  }

  async remove(name: string): Promise<void> {
    const decks = await this.list();
    if (!decks.some((item) => item.name === name)) {
      throw new AnkiNotFoundError(`Deck "${name}" does not exist. Use list_decks to see available decks.`);
    }
    await this.client.invoke<null>('deleteDecks', { decks: [name], cardsToo: true });
  }
}
