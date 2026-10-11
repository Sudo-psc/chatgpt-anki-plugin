import { describe, expect, it } from 'vitest';
import { computeNextCardSchedule, normalizeReviewRating, RATING_OPTIONS } from '../../src/anki/review.js';
import type { CardSummary } from '../../src/domain/entities.js';

const baseCard: CardSummary = {
  cardId: 1001,
  noteId: 501,
  deckName: 'Default',
  modelName: 'Basic',
  question: 'Q',
  answer: 'A',
  fields: { Front: 'Q', Back: 'A' },
  tags: ['test'],
  type: 2,
  queue: 2,
  interval: 10,
  factor: 2500,
  reps: 3,
  lapses: 0,
  due: 0,
};

describe('Review rating normalization and FSRS/SM-2 schedule helpers (src/anki/review.ts)', () => {
  it('exposes the 4 canonical Anki rating options', () => {
    expect(RATING_OPTIONS).toHaveLength(4);
    expect(RATING_OPTIONS.map((o) => o.label)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  });

  it('normalizes numeric and string ratings (1..4 and again/hard/good/easy)', () => {
    expect(normalizeReviewRating(1)).toEqual({ ease: 1, label: 'Again' });
    expect(normalizeReviewRating(2)).toEqual({ ease: 2, label: 'Hard' });
    expect(normalizeReviewRating(3)).toEqual({ ease: 3, label: 'Good' });
    expect(normalizeReviewRating(4)).toEqual({ ease: 4, label: 'Easy' });
    expect(normalizeReviewRating('again')).toEqual({ ease: 1, label: 'Again' });
    expect(normalizeReviewRating('HARD')).toEqual({ ease: 2, label: 'Hard' });
    expect(normalizeReviewRating('Good')).toEqual({ ease: 3, label: 'Good' });
    expect(normalizeReviewRating('4')).toEqual({ ease: 4, label: 'Easy' });
    expect(() => normalizeReviewRating(5)).toThrowError(/Invalid review rating/);
    expect(() => normalizeReviewRating('invalid')).toThrowError(/Invalid review rating/);
  });

  it('computes next schedule for Again, Hard, Good, and Easy', () => {
    const again = computeNextCardSchedule(baseCard, 1);
    expect(again.interval).toBe(1);
    expect(again.lapses).toBe(1);
    expect(again.factor).toBe(2300);

    const hard = computeNextCardSchedule(baseCard, 2);
    expect(hard.interval).toBe(12);
    expect(hard.factor).toBe(2350);

    const good = computeNextCardSchedule(baseCard, 3);
    expect(good.interval).toBe(25);
    expect(good.reps).toBe(4);

    const easy = computeNextCardSchedule(baseCard, 4);
    expect(easy.interval).toBeGreaterThan(good.interval);
    expect(easy.factor).toBe(2650);

    // Also test scheduling on a brand-new card (type=0, interval=0, factor=0)
    const newCard: CardSummary = { ...baseCard, type: 0, queue: 0, interval: 0, factor: 0 };
    expect(computeNextCardSchedule(newCard, 1).type).toBe(1);
    expect(computeNextCardSchedule(newCard, 2).interval).toBe(1);
    expect(computeNextCardSchedule(newCard, 3).interval).toBe(3);
    expect(computeNextCardSchedule(newCard, 4).interval).toBe(7);
  });
});
