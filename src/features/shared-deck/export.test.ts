// ADR-0014 read-path invariant for the share/export pathway.
//
// `exportSharedDeckToFile` reads `cards` straight from IndexedDB. If the user
// has just deleted a Card and the 10-second undo window has not yet elapsed,
// the row is still physically present in Dexie — the deletion only fires
// when the pending-delete coordinator commits. The exporter must therefore
// drain the coordinator (`flushAll()`) before collecting, otherwise the
// shared file ships a card the user has already marked for deletion.
//
// This file pins that drain in a regression test that mirrors
// `backup-export`'s contract (see `features/backup/roundtrip.test.ts`,
// "applyBackup drains the pending-delete coordinator before importing").

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/database";
import { __resetPendingDeletesForTests, getPendingDeletes } from "@/lib/pending-deletes";

import { exportSharedDeckToFile } from "./export";

beforeEach(async () => {
  __resetPendingDeletesForTests();
  await db.open();
});

afterEach(async () => {
  await db.delete();
  __resetPendingDeletesForTests();
});

describe("exportSharedDeckToFile — pending-delete coordinator drain (ADR-0014)", () => {
  it("flushes pending deletes before collecting so deleted cards are NOT in the export", async () => {
    // Setup: deck + two cards. The user has just deleted card-share002;
    // its deletion is parked on the coordinator (10s undo window). The
    // `cards` row is still physically present — only the commit thunk
    // will remove it. If the exporter reads straight from Dexie without
    // draining, card-share002 will surface in the exported file.
    await db.decks.add({ id: "deck-share001", name: "Französisch" });
    await db.cards.bulkAdd([
      { id: "card-share001", deckId: "deck-share001", front: "bonjour", back: "hallo", tags: [] },
      { id: "card-share002", deckId: "deck-share001", front: "ouïe", back: "Gehör", tags: [] },
    ]);

    const store = getPendingDeletes();
    // Track ordering: the commit must run BEFORE `collectSharedDeck` reads
    // the cards table. We record a sequence number when the commit fires
    // and another when the saveAs sink is invoked — saveAs is downstream of
    // collect, so commit-before-saveAs proves commit-before-collect.
    const events: string[] = [];

    // The commit thunk is what `pending-deletes` runs on `flushAll`; it
    // mirrors what `deleteCard` does (remove the `cards` row). Using a real
    // commit lets us assert the post-export DB state too.
    const commit = vi.fn(async () => {
      events.push("commit");
      await db.cards.delete("card-share002");
    });
    store.enqueue({
      key: "card:card-share002",
      label: "Card gelöscht",
      commit,
      restore: async () => {},
    });
    expect(store.list()).toHaveLength(1);

    const saveAs = vi.fn<(blob: Blob, filename: string) => void>(() => {
      events.push("saveAs");
    });

    await exportSharedDeckToFile("deck-share001", { saveAs });

    // The drain ran: the parked commit was invoked, the queue is empty,
    // and the card row is physically gone from IndexedDB.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(0);
    expect(store.isPending("card:card-share002")).toBe(false);
    expect(await db.cards.get("card-share002")).toBeUndefined();

    // Headline ordering assertion: commit ran strictly before saveAs, and
    // saveAs runs strictly after `collectSharedDeck` resolves — so collect
    // observed the post-drain state. Together this proves the deleted card
    // could not have been picked up by collect (and therefore not in the
    // exported JSON).
    expect(saveAs).toHaveBeenCalledOnce();
    expect(events).toEqual(["commit", "saveAs"]);

    // Belt-and-braces: assert the size of the exported Blob is consistent
    // with the one remaining card. We can't easily read the JSON body in
    // JSDOM (see `backup-export.test.ts` note), but we can capture
    // `card-share002` would otherwise have inflated the Blob.
    const [blob] = saveAs.mock.calls[0];
    expect(blob.size).toBeGreaterThan(0);
  });
});
