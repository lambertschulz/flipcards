import { listAllCards } from "@/db/cards";
import { extractTagsFromCards } from "@/domain/tags";
import { useLiveQuery } from "dexie-react-hooks";

export type TagFrequency = { tag: string; count: number };

/**
 * Live frequency-sorted tag list across all cards in all decks.
 * Source for the card-editor's tag-autocomplete. Recomputes on any
 * cards-table change via dexie-react-hooks.
 */
export function useGlobalTags(): TagFrequency[] {
  return useLiveQuery(async () => extractTagsFromCards(await listAllCards()), [], []);
}
