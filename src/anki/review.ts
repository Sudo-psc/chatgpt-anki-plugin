import type { ReviewEase, ReviewOutcome, StatsResult } from '../domain/types.js';
import type { AnkiConnectClient } from './client.js';
import { deckQuery } from './decks.js';
import { AnkiNotFoundError } from './errors.js';
import type { AnkiDeckStatsWire } from './wire-types.js';

const EASE_TO_NUMBER: Record<ReviewEase, number> = { again: 1, hard: 2, good: 3, easy: 4 };

export class ReviewAdapter {
  constructor(private readonly client: AnkiConnectClient) {}

  /**
   * Answers a card with the given ease via AnkiConnect `answerCards`
   * (ease 1 = Again … 4 = Easy). Requires a recent AnkiConnect that exposes
   * the `answerCards` action; older versions return "unsupported action".
   */
  async submit(cardId: number, ease: ReviewEase): Promise<ReviewOutcome> {
    const ids = await this.client.invoke<number[]>('findCards', { query: `cid:${cardId}` });
    if (!ids.includes(cardId)) {
      throw new AnkiNotFoundError(`Card ${cardId} does not exist. Use get_due_cards or search_cards to find cards.`);
    }
    const results = await this.client.invoke<boolean[]>('answerCards', {
      answers: [{ cardId, ease: EASE_TO_NUMBER[ease] }],
    });
    return { cardId, ease, answered: results[0] === true };
  }

  async stats(deck?: string): Promise<StatsResult> {
    const prefix = deck ? `${deckQuery(deck)} ` : '';
    const [reviewedToday, newCount, learningCount, reviewCount, dueCount] = await Promise.all([
      this.client.invoke<number>('getNumCardsReviewedToday'),
      this.client.invoke<number[]>('findCards', { query: `${prefix}is:new` }).then((ids) => ids.length),
      this.client.invoke<number[]>('findCards', { query: `${prefix}is:learn` }).then((ids) => ids.length),
      this.client.invoke<number[]>('findCards', { query: `${prefix}is:review` }).then((ids) => ids.length),
      this.client.invoke<number[]>('findCards', { query: `${prefix}is:due` }).then((ids) => ids.length),
    ]);

    const result: StatsResult = {
      reviewedToday,
      counts: { newCount, learningCount, reviewCount, dueCount },
    };

    if (deck) {
      result.deck = deck;
      const statsMap = await this.client.invoke<Record<string, AnkiDeckStatsWire>>('getDeckStats', {
        decks: [deck],
      });
      const stats = Object.values(statsMap).find((item) => item.name === deck);
      if (stats) {
        result.deckStats = {
          newCount: stats.new_count,
          learnCount: stats.learn_count,
          reviewCount: stats.review_count,
          totalInDeck: stats.total_in_deck,
        };
      }
    }

    return result;
  }
}
