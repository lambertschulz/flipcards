// Orchestrator for "Deck teilen / exportieren". Collects deck + cards →
// stringifies → downloads as `<deck-slug>-shared.json`. Single entry point
// the deck-detail button calls. See ADR-0018 for the file format and
// CONTEXT.md (Shared Deck) for the "no review-state" rule.

import { stringifySharedDeck } from "@/domain/shared-deck";
import { getPendingDeletes } from "@/lib/pending-deletes";

import { collectSharedDeck } from "./collect";
import { triggerDownload } from "./download";
import { sharedDeckFilename } from "./filename";

export type ExportDeps = {
  /** Override the clock for tests. Defaults to `Date.now()`. */
  now?: () => Date;
  /** Override the file save sink for tests. Defaults to a real `<a>.click()`. */
  saveAs?: (blob: Blob, filename: string) => void;
};

export async function exportSharedDeckToFile(deckId: string, deps: ExportDeps = {}): Promise<void> {
  // ADR-0014 read-path invariant: pending-deleted rows must not surface in
  // any read path. `collectSharedDeck` reads `cards` straight from IndexedDB,
  // so a card the user deleted during its 10-second undo window would still
  // be physically present and end up in the exported file. Mirror the
  // backup-export pathway: drain the coordinator (commit-or-fail each
  // in-flight op) before we collect, so the snapshot reflects the user's
  // intent. `flushAll()` matches the synchronous-flush guarantees on
  // visibilitychange/pagehide.
  await getPendingDeletes().flushAll();

  const now = (deps.now ?? (() => new Date()))();
  const file = await collectSharedDeck(deckId, { now: () => now });
  const json = stringifySharedDeck(file);
  const blob = new Blob([json], { type: "application/json" });
  const filename = sharedDeckFilename(file.deck.name);
  (deps.saveAs ?? triggerDownload)(blob, filename);
}
