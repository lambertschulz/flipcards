// Orchestrator for "Deck-Set teilen / exportieren". Collects deck-set +
// member decks + cards → stringifies → downloads as
// `<deckset-slug>-shared.json`. Single entry point the deck-set-detail
// button calls. See ADR-0018 for the file format and CONTEXT.md
// (Shared Deck-Set) for the "no review-state" rule.

import { stringifySharedDeckSet } from "@/domain/shared-deck";

import { collectSharedDeckSet } from "./collect";
import { triggerDownload } from "./download";
import { sharedDeckSetFilename } from "./filename";

export type ExportDeps = {
  /** Override the clock for tests. Defaults to `Date.now()`. */
  now?: () => Date;
  /** Override the file save sink for tests. Defaults to a real `<a>.click()`. */
  saveAs?: (blob: Blob, filename: string) => void;
};

export async function exportSharedDeckSetToFile(
  deckSetId: string,
  deps: ExportDeps = {},
): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  const file = await collectSharedDeckSet(deckSetId, { now: () => now });
  const json = stringifySharedDeckSet(file);
  const blob = new Blob([json], { type: "application/json" });
  const filename = sharedDeckSetFilename(file.deckSet.name);
  (deps.saveAs ?? triggerDownload)(blob, filename);
}
