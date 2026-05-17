// Headline AC of issue #23:
//
//   "Round-Trip-Test: Export → Import in „leeres" Setup → identische
//   Struktur (Set + Decks + Cards + Tags), alle Cards sofort due."
//
// Exercises the full vertical: real Dexie (via fake-indexeddb), the
// `collect → stringify → parse → applySharedDeckSetImport` pipeline,
// with a DB-wipe between halves to simulate "leeres Setup".

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/database";
import { parseSharedDeckSet, stringifySharedDeckSet } from "@/domain/shared-deck";

import { applySharedDeckSetImport } from "./apply";
import { collectSharedDeckSet } from "./collect";

const fixedClock = { now: () => new Date("2026-05-17T08:00:00Z") };

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe("SharedDeckSet round-trip (issue #23 headline AC)", () => {
  it("Export → wipe → Import yields identical set + decks + cards + tags, all cards due", async () => {
    // Seed: a deck-set with two decks, three cards across them, plus a
    // review-state that MUST NOT travel.
    await db.deckSets.add({
      id: "set-roundtrip01",
      name: "Sprachen",
      description: "Reisen",
    });
    await db.decks.bulkAdd([
      {
        id: "deck-roundtrip01",
        name: "Französisch",
        description: "A2",
        deckSetId: "set-roundtrip01",
      },
      {
        id: "deck-roundtrip02",
        name: "Italienisch",
        deckSetId: "set-roundtrip01",
      },
    ]);
    await db.cards.bulkAdd([
      {
        id: "card-roundtrip01",
        deckId: "deck-roundtrip01",
        front: "bonjour",
        back: "hallo",
        tags: ["fr", "easy"],
      },
      {
        id: "card-roundtrip02",
        deckId: "deck-roundtrip01",
        front: "ouïe",
        back: "Gehör",
        tags: ["fr"],
      },
      {
        id: "card-roundtrip03",
        deckId: "deck-roundtrip02",
        front: "buongiorno",
        back: "guten Tag",
        tags: ["it"],
      },
    ]);
    await db.reviewStates.add({
      cardId: "card-roundtrip01",
      repetitions: 3,
      easeFactor: 2.7,
      intervalDays: 8,
      nextDue: 1_715_900_000_000,
    });

    const file = await collectSharedDeckSet("set-roundtrip01", fixedClock);
    // Sanity: no review-state shipped.
    expect("reviewStates" in file).toBe(false);
    expect(file.decks).toHaveLength(2);

    const json = stringifySharedDeckSet(file);

    // Wipe to simulate a "leeres Setup".
    await db.deckSets.clear();
    await db.decks.clear();
    await db.cards.clear();
    await db.reviewStates.clear();

    const parsed = parseSharedDeckSet(json);
    if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.error)}`);
    const summary = await applySharedDeckSetImport(parsed.value);

    expect(summary.setMode).toBe("new");
    expect(summary.decks).toHaveLength(2);
    expect(summary.decks.every((d) => d.mode === "new")).toBe(true);

    const set = await db.deckSets.get("set-roundtrip01");
    expect(set?.name).toBe("Sprachen");
    expect(set?.description).toBe("Reisen");

    const decks = (await db.decks.where("deckSetId").equals("set-roundtrip01").toArray()).sort(
      (a, b) => (a.id < b.id ? -1 : 1),
    );
    expect(decks.map((d) => d.id)).toEqual(["deck-roundtrip01", "deck-roundtrip02"]);

    const cards = (await db.cards.toArray()).sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(cards).toEqual([
      {
        id: "card-roundtrip01",
        deckId: "deck-roundtrip01",
        front: "bonjour",
        back: "hallo",
        tags: ["fr", "easy"],
      },
      {
        id: "card-roundtrip02",
        deckId: "deck-roundtrip01",
        front: "ouïe",
        back: "Gehör",
        tags: ["fr"],
      },
      {
        id: "card-roundtrip03",
        deckId: "deck-roundtrip02",
        front: "buongiorno",
        back: "guten Tag",
        tags: ["it"],
      },
    ]);

    // Per CONTEXT.md, cards without a review-state are immediately due.
    const states = await db.reviewStates.toArray();
    expect(states).toHaveLength(0);
  });
});
