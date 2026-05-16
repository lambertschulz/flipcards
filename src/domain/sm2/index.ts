// SM-2 spaced-repetition domain. Pure — no React, Dexie, or Jotai imports.
// See ADR-0002 (SM-2 algorithm) and ADR-0007 (domain-layer separation).

export type Rating = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextDue: number;
};

export const MIN_EASE_FACTOR = 1.3;
export const DEFAULT_EASE_FACTOR = 2.5;

export const INITIAL_REVIEW_STATE: ReviewState = {
  repetitions: 0,
  easeFactor: DEFAULT_EASE_FACTOR,
  intervalDays: 0,
  nextDue: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const QUALITY: Record<Rating, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

function adjustEase(ef: number, q: number): number {
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const next = ef + delta;
  return next < MIN_EASE_FACTOR ? MIN_EASE_FACTOR : next;
}

export function scheduleNext(state: ReviewState, rating: Rating, now: number): ReviewState {
  const q = QUALITY[rating];
  const easeFactor = adjustEase(state.easeFactor, q);

  if (q < 3) {
    return {
      repetitions: 0,
      easeFactor,
      intervalDays: 1,
      nextDue: now + DAY_MS,
    };
  }

  const repetitions = state.repetitions + 1;
  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(state.intervalDays * easeFactor);

  // "Hard" answers a correct card, but the user struggled — shorten the next
  // interval (Anki-style 1.2x of previous) without resetting reps.
  if (rating === "hard") {
    const hardInterval = Math.max(1, Math.round(state.intervalDays * 1.2));
    intervalDays = repetitions <= 1 ? 1 : hardInterval;
  }

  // "Easy" earns a bonus on top of the standard step.
  if (rating === "easy") {
    intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * 1.3));
  }

  return {
    repetitions,
    easeFactor,
    intervalDays,
    nextDue: now + intervalDays * DAY_MS,
  };
}

export function isDue(state: ReviewState, now: number): boolean {
  return state.nextDue <= now;
}
