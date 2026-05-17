import { db } from "@/db/database";
import { extractTagsFromCards } from "@/domain/tags";
import { useVisibleCards } from "@/lib/pending-deletes-react";
import { useMemo } from "react";

export type TagFrequency = { tag: string; count: number };

/**
 * Live frequency-sorted tag list across all cards in all decks.
 *
 * Source for the card-editor's tag-autocomplete. Recomputes on any
 * cards-table change via dexie-react-hooks.
 *
 * ADR-0014 invariant: the tag source MUST honour pending-delete state —
 * tags that exist only on optimistically-deleted cards must not appear in
 * the autocomplete during the 10s undo window. We route the cards read
 * through `useVisibleCards` so pending-deleted card rows (and cascade
 * descendants of a pending deck/deck-set delete) never reach
 * `extractTagsFromCards`. This replaces the prior `useLiveQuery(async () =>
 * extractTagsFromCards(await listAllCards()))` call, which read raw rows
 * straight from Dexie and was the documented Round-3 leak in the brief.
 */
export function useGlobalTags(): TagFrequency[] {
  const cards = useVisibleCards(() => db.cards.toArray(), [], []);
  return useMemo(() => extractTagsFromCards(cards ?? []), [cards]);
}
