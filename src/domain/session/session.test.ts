import type { Card } from "@/domain/card";
import { buildSessionQueue, requeueIfAgain, summarize } from "@/domain/session";
import { describe, expect, it } from "vitest";

function makeCards(n: number): Card[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `card-${i}`,
    deckId: "deck",
    front: `front-${i}`,
    back: `back-${i}`,
    tags: [],
  }));
}

// Deterministic generator-based RNG seam so order is testable.
function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("buildSessionQueue", () => {
  it("snapshots the input — later mutations to the source array don't affect the queue", () => {
    const cards = makeCards(3);
    const queue = buildSessionQueue(cards, { kind: "open-ended" }, { rng: () => 0 });
    cards.push({ id: "x", deckId: "deck", front: "x", back: "x", tags: [] });
    expect(queue).toHaveLength(3);
    expect(queue.find((c) => c.id === "x")).toBeUndefined();
  });

  it("shuffles using the provided rng (deterministic with a fixed sequence)", () => {
    const cards = makeCards(4);
    const queueA = buildSessionQueue(
      cards,
      { kind: "open-ended" },
      {
        rng: fixedRng([0.1, 0.9, 0.5, 0.2]),
      },
    );
    const queueB = buildSessionQueue(
      cards,
      { kind: "open-ended" },
      {
        rng: fixedRng([0.1, 0.9, 0.5, 0.2]),
      },
    );
    expect(queueA.map((c) => c.id)).toEqual(queueB.map((c) => c.id));
  });

  it("caps the queue at the bounded count when there are more due cards than requested", () => {
    const cards = makeCards(10);
    const queue = buildSessionQueue(cards, { kind: "bounded", count: 3 }, { rng: () => 0 });
    expect(queue).toHaveLength(3);
  });

  it("returns all due cards when bounded count exceeds available — no padding, no error", () => {
    const cards = makeCards(2);
    const queue = buildSessionQueue(cards, { kind: "bounded", count: 5 }, { rng: () => 0 });
    expect(queue).toHaveLength(2);
  });

  it("returns an empty queue when there are no due cards", () => {
    expect(buildSessionQueue([], { kind: "open-ended" })).toEqual([]);
    expect(buildSessionQueue([], { kind: "bounded", count: 5 })).toEqual([]);
  });
});

describe("requeueIfAgain", () => {
  const [a, b, c] = makeCards(3);

  it("appends the card to the back of the queue when the rating is 'again'", () => {
    const next = requeueIfAgain([b, c], a, "again");
    expect(next.map((card) => card.id)).toEqual(["card-1", "card-2", "card-0"]);
  });

  it("leaves the queue unchanged for ratings other than 'again'", () => {
    expect(requeueIfAgain([b, c], a, "good")).toEqual([b, c]);
    expect(requeueIfAgain([b, c], a, "hard")).toEqual([b, c]);
    expect(requeueIfAgain([b, c], a, "easy")).toEqual([b, c]);
  });
});

describe("summarize", () => {
  it("counts ratings and computes total reviews", () => {
    const summary = summarize([
      { cardId: "a", rating: "good" },
      { cardId: "b", rating: "again" },
      { cardId: "a", rating: "good" }, // re-surfaced after Again
      { cardId: "c", rating: "easy" },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.byRating).toEqual({ again: 1, hard: 0, good: 2, easy: 1 });
  });

  it("returns zeroed counts for an empty answer list", () => {
    expect(summarize([])).toEqual({
      total: 0,
      byRating: { again: 0, hard: 0, good: 0, easy: 0 },
    });
  });
});
