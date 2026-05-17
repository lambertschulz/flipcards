// Orchestrator for "Deck teilen / exportieren". Collects deck + cards →
// stringifies → downloads as `<deck-slug>-shared.json`. Single entry point
// the deck-detail button calls. See ADR-0018 for the file format and
// CONTEXT.md (Shared Deck) for the "no review-state" rule.

import { stringifySharedDeck } from "@/domain/shared-deck";

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
  const now = (deps.now ?? (() => new Date()))();
  const file = await collectSharedDeck(deckId, { now: () => now });
  const json = stringifySharedDeck(file);
  const blob = new Blob([json], { type: "application/json" });
  const filename = sharedDeckFilename(file.deck.name);
  (deps.saveAs ?? triggerDownload)(blob, filename);
}
