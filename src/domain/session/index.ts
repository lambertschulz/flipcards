// Review-session domain — pure queue manipulation, no React/Dexie.
// See CONTEXT.md (Review Session) and ADR-0004 (sessions over daily limits).

import type { Card } from "@/domain/card";
import type { Rating } from "@/domain/sm2";

export type SessionMode = { kind: "open-ended" } | { kind: "bounded"; count: number };

export type BuildOptions = {
  rng?: () => number;
};

export function buildSessionQueue(
  dueCards: readonly Card[],
  mode: SessionMode,
  { rng = Math.random }: BuildOptions = {},
): Card[] {
  const shuffled = shuffle([...dueCards], rng);
  if (mode.kind === "bounded") return shuffled.slice(0, mode.count);
  return shuffled;
}

export function requeueIfAgain(queue: readonly Card[], card: Card, rating: Rating): Card[] {
  if (rating !== "again") return [...queue];
  return [...queue, card];
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

export type AnswerEvent = { cardId: string; rating: Rating };

export type SessionSummary = {
  total: number;
  byRating: Record<Rating, number>;
};

export function summarize(answers: readonly AnswerEvent[]): SessionSummary {
  const byRating: Record<Rating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const { rating } of answers) byRating[rating] += 1;
  return { total: answers.length, byRating };
}
