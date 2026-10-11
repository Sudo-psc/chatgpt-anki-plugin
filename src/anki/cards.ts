import { mapCard } from '../domain/mappers.js';
import type { CardView, SearchPage } from '../domain/types.js';
import type { AnkiConnectClient } from './client.js';
import { deckQuery } from './decks.js';
import { AnkiNotFoundError } from './errors.js';
import type { AnkiCardInfo, AnkiNoteInfo } from './wire-types.js';

export class CardsAdapter {
  constructor(private readonly client: AnkiConnectClient) {}

  private async tagsByNote(noteIds: number[]): Promise<Map<number, string[]>> {
    const unique = [...new Set(noteIds)];
    if (unique.length === 0) return new Map();
    const notes = await this.client.invoke<AnkiNoteInfo[]>('notesInfo', { notes: unique });
    const map = new Map<number, string[]>();
    for (const note of notes) map.set(note.noteId, note.tags ?? []);
    return map;
  }

  async search(query: string, limit: number): Promise<SearchPage> {
    const ids = await this.client.invoke<number[]>('findCards', { query });
    const pageIds = ids.slice(0, limit);
    if (pageIds.length === 0) {
      return { total: ids.length, returned: 0, cards: [] };
    }
    const infos = await this.client.invoke<AnkiCardInfo[]>('cardsInfo', { cards: pageIds });
    const tags = await this.tagsByNote(infos.map((info) => info.note));
    const cards = infos.map((info) => mapCard(info, tags.get(info.note) ?? []));
    return { total: ids.length, returned: cards.length, cards };
  }

  async get(cardId: number): Promise<CardView> {
    const ids = await this.client.invoke<number[]>('findCards', { query: `cid:${cardId}` });
    if (!ids.includes(cardId)) {
      throw new AnkiNotFoundError(`Card ${cardId} does not exist. Use search_cards to find cards.`);
    }
    const infos = await this.client.invoke<AnkiCardInfo[]>('cardsInfo', { cards: [cardId] });
    const info = infos[0];
    if (!info) {
      throw new AnkiNotFoundError(`Card ${cardId} does not exist. Use search_cards to find cards.`);
    }
    const tags = await this.tagsByNote([info.note]);
    return mapCard(info, tags.get(info.note) ?? []);
  }

  async due(deck: string | undefined, limit: number): Promise<SearchPage> {
    const query = deck ? `${deckQuery(deck)} is:due` : 'is:due';
    return this.search(query, limit);
  }

  async count(query: string): Promise<number> {
    const ids = await this.client.invoke<number[]>('findCards', { query });
    return ids.length;
  }

  async exists(cardId: number): Promise<boolean> {
    const ids = await this.client.invoke<number[]>('findCards', { query: `cid:${cardId}` });
    return ids.includes(cardId);
  }
}
