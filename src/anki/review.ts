import type { CardSummary, ReviewEase, ReviewRatingLabel } from '../domain/entities.js';
import { AnkiPluginError } from '../domain/errors.js';

/**
 * Review rating normalization and deterministic FSRS/SM-2 state progression helper.
 */

export type ReviewRatingInput = 1 | 2 | 3 | 4 | '1' | '2' | '3' | '4' | 'again' | 'hard' | 'good' | 'easy' | string | number;

const EASE_TO_LABEL: Record<ReviewEase, ReviewRatingLabel> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export const RATING_OPTIONS: ReadonlyArray<{ ease: ReviewEase; label: ReviewRatingLabel; description: string }> = [
  { ease: 1, label: 'Again', description: 'Forgot the card; reset or lapse to relearning.' },
  { ease: 2, label: 'Hard', description: 'Recalled with significant effort; smaller interval growth.' },
  { ease: 3, label: 'Good', description: 'Recalled at the target retention level; standard interval growth.' },
  { ease: 4, label: 'Easy', description: 'Effortless recall; larger interval bonus.' },
];

export function normalizeReviewRating(input: ReviewRatingInput): { ease: ReviewEase; label: ReviewRatingLabel } {
  if (typeof input === 'number') {
    if (input === 1 || input === 2 || input === 3 || input === 4) {
      return { ease: input, label: EASE_TO_LABEL[input] };
    }
  } else if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === '1' || normalized === 'again') return { ease: 1, label: 'Again' };
    if (normalized === '2' || normalized === 'hard') return { ease: 2, label: 'Hard' };
    if (normalized === '3' || normalized === 'good') return { ease: 3, label: 'Good' };
    if (normalized === '4' || normalized === 'easy') return { ease: 4, label: 'Easy' };
  }

  throw new AnkiPluginError(
    'INVALID_ARGUMENTS',
    `Invalid review rating '${String(input)}'. Expected 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`,
    'Pass a number 1..4 or one of "again", "hard", "good", "easy".',
    false,
  );
}

/**
 * Applies a realistic SM-2/FSRS-compatible scheduling transition for the in-memory sandbox adapter.
 * (When running against AnkiConnect, Anki's own scheduler handles scheduling via `answerCards`.)
 */
export function computeNextCardSchedule(card: CardSummary, ease: ReviewEase): CardSummary {
  const currentIvl = Math.max(0, card.interval);
  const currentFactor = card.factor > 0 ? card.factor : 2500;
  let nextIvl = 1;
  let nextFactor = currentFactor;
  let nextLapses = card.lapses;
  let nextType = card.type;
  let nextQueue = card.queue;

  if (ease === 1) {
    nextIvl = 1;
    nextFactor = Math.max(1300, currentFactor - 200);
    if (card.type === 2) {
      nextLapses += 1;
    }
    nextType = card.type === 0 ? 1 : 3;
    nextQueue = 1;
  } else if (ease === 2) {
    nextIvl = currentIvl === 0 ? 1 : Math.max(1, Math.round(currentIvl * 1.2));
    nextFactor = Math.max(1300, currentFactor - 150);
    nextType = 2;
    nextQueue = 2;
  } else if (ease === 3) {
    const multiplier = currentFactor / 1000;
    nextIvl = currentIvl === 0 ? 3 : Math.max(currentIvl + 1, Math.round(currentIvl * multiplier));
    nextType = 2;
    nextQueue = 2;
  } else {
    const multiplier = (currentFactor / 1000) * 1.3;
    nextIvl = currentIvl === 0 ? 7 : Math.max(currentIvl + 2, Math.round(currentIvl * multiplier));
    nextFactor = currentFactor + 150;
    nextType = 2;
    nextQueue = 2;
  }

  return {
    ...card,
    type: nextType,
    queue: nextQueue,
    interval: nextIvl,
    factor: nextFactor,
    reps: card.reps + 1,
    lapses: nextLapses,
    due: nextIvl,
  };
}
