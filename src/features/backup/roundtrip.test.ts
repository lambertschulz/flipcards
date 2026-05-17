// The headline acceptance criterion of issue #21:
//
//   "Round-Trip: Export → vollständiger Reset → Import stellt den exakten
//   vorherigen Zustand wieder her (Test mit Fixture)."
//
// We exercise the full vertical: real Dexie (via fake-indexeddb), the
// `collect → stringify → parse → applyBackup` pipeline, and the wipe-step
// in the middle.

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/database";
import { parseBackup, stringifyBackup } from "@/domain/backup";
import { applyBackup } from "@/features/backup/apply";
import { collectBackup } from "@/features/backup/collect";
import { wipeAllData } from "@/features/settings/wipe";
import { __resetPendingDeletesForTests, getPendingDeletes } from "@/lib/pending-deletes";

const fixedClock = { now: () => new Date("2026-05-17T08:00:00Z") };

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  await db.delete();
  __resetPendingDeletesForTests();
});

async function seedFixture() {
  await db.deckSets.add({ id: "set-medi01", name: "Medizin", description: "Erstes Semester" });
  await db.decks.bulkAdd([
    { id: "deck-anat01", name: "Anatomie", deckSetId: "set-medi01" },
    { id: "deck-loose1", name: "Lose Vokabeln", description: "Allerlei" },
  ]);
  await db.cards.bulkAdd([
    {
      id: "card-anat01",
      deckId: "deck-anat01",
      front: "Hippocampus",
      back: "Gedächtnis",
      tags: ["neuro", "anatomie"],
    },
    { id: "card-anat02", deckId: "deck-anat01", front: "Pons", back: "Brücke", tags: [] },
    { id: "card-vok001", deckId: "deck-loose1", front: "ouïe", back: "Gehör", tags: ["fr"] },
  ]);
  await db.reviewStates.bulkAdd([
    {
      cardId: "card-anat01",
      repetitions: 4,
      easeFactor: 2.6,
      intervalDays: 12,
      nextDue: 1_715_900_000_000,
    },
  ]);
  await db.reviews.bulkAdd([
    {
      id: "review-aaaaaa1",
      cardId: "card-anat01",
      timestamp: 1_715_899_000_000,
      rating: "good",
      intervalAfter: 12,
      easeAfter: 2.6,
    },
  ]);
}

async function snapshotDb() {
  return {
    decks: await db.decks.toArray(),
    deckSets: await db.deckSets.toArray(),
    cards: await db.cards.toArray(),
    reviewStates: await db.reviewStates.toArray(),
    reviews: await db.reviews.toArray(),
  };
}

describe("Backup round-trip (issue #21 headline AC)", () => {
  it("Export → wipe → Import restores the exact prior state", async () => {
    await seedFixture();
    const before = await snapshotDb();

    const file = await collectBackup(fixedClock);
    const json = stringifyBackup(file);

    await wipeAllData();
    // Sanity: wipe really cleared the DB.
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);

    const parseResult = parseBackup(json);
    if (!parseResult.ok) throw new Error(`parse failed: ${JSON.stringify(parseResult.error)}`);
    const summary = await applyBackup(parseResult.value);

    expect(summary).toEqual({
      decks: 2,
      deckSets: 1,
      cards: 3,
      reviewStates: 1,
      reviews: 1,
    });

    const after = await snapshotDb();
    // Sort to be order-independent — Dexie doesn't promise insertion order on
    // `toArray()`. The pure shape comparison is what the ticket cares about.
    const sortById = <T extends { id?: string; cardId?: string }>(rows: T[]): T[] =>
      [...rows].sort((a, b) => ((a.id ?? a.cardId ?? "") < (b.id ?? b.cardId ?? "") ? -1 : 1));

    expect(sortById(after.decks)).toEqual(sortById(before.decks));
    expect(sortById(after.deckSets)).toEqual(sortById(before.deckSets));
    expect(sortById(after.cards)).toEqual(sortById(before.cards));
    expect(sortById(after.reviewStates)).toEqual(sortById(before.reviewStates));
    expect(sortById(after.reviews)).toEqual(sortById(before.reviews));
  });

  it("applyBackup drains the pending-delete coordinator before importing (round-4)", async () => {
    // ADR-0014 class (b): destructive bulk-replace paths must call
    // `cancelAll()` BEFORE clobbering the DB. The risk this regression
    // pins: a deferred delete whose primary key collides with a row in
    // the imported backup would otherwise fire (timer pops, or
    // `visibilitychange` calls `flushAll`) and silently delete the
    // freshly-imported row.
    //
    // Setup: seed a card, enqueue a pending delete for that card's key,
    // then apply a backup that contains a card with the SAME id. After
    // applyBackup resolves, the imported card must be present in the DB
    // (because the pending op was discarded — `cancelAll()`, not
    // `flushAll()`).
    await seedFixture();
    const store = getPendingDeletes();

    const commit = vi.fn().mockResolvedValue(undefined);
    // Primary key collides with `card-anat01` in seedFixture / the backup.
    store.enqueue({
      key: "card:card-anat01",
      label: "Card gelöscht",
      commit,
      restore: async () => {},
    });
    expect(store.list()).toHaveLength(1);

    const file = await collectBackup(fixedClock);

    // Wipe to simulate the import flow; wipe also drains the coordinator
    // (which is part of the contract being tested), so re-enqueue a
    // fresh pending op AFTER the wipe to exercise applyBackup's own drain.
    await wipeAllData();
    const commitAfterWipe = vi.fn().mockResolvedValue(undefined);
    store.enqueue({
      key: "card:card-anat01",
      label: "Card gelöscht",
      commit: commitAfterWipe,
      restore: async () => {},
    });
    expect(store.list()).toHaveLength(1);

    const parseResult = parseBackup(stringifyBackup(file));
    if (!parseResult.ok) throw new Error(`parse failed: ${JSON.stringify(parseResult.error)}`);
    await applyBackup(parseResult.value);

    // The post-wipe pending op was discarded — its commit must NOT have
    // fired onto the imported data.
    expect(commitAfterWipe).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
    expect(store.isPending("card:card-anat01")).toBe(false);

    // The imported card is present (the pending op did NOT delete it).
    const importedCard = await db.cards.get("card-anat01");
    expect(importedCard).toBeDefined();
    expect(importedCard?.front).toBe("Hippocampus");
  });

  it("sanitises orphan deckSetId during export (codex review PR #50)", async () => {
    // The home page tolerates a deck pointing at a missing Deck-Set (treats
    // it as lose). Before this fix, `collectBackup` preserved the stale id
    // while the exported `deckSets` array lacked the referenced row, so
    // `parseBackup`'s "decks.deckSetId must reference…" refine rejected the
    // file — users with this tolerated DB state couldn't restore their own
    // backup. The fix in `collect.ts` silently drops the orphan reference
    // (deck becomes lose), so the round-trip succeeds.
    await db.decks.add({
      id: "deck-orphan1",
      name: "Lost in space",
      deckSetId: "set-ghostzzz", // no matching row in deckSets table
    });

    const file = await collectBackup(fixedClock);
    expect(file.decks[0].deckSetId).toBeUndefined();

    const json = stringifyBackup(file);
    const parseResult = parseBackup(json);
    if (!parseResult.ok) throw new Error(`parse failed: ${JSON.stringify(parseResult.error)}`);
    expect(parseResult.value.decks[0].deckSetId).toBeUndefined();
  });
});
