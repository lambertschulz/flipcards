// Tag-aggregate helpers. The card-frequency variant (`extractTagsFromCards`,
// used by the card-editor's autocomplete per issue #5) lives in
// `src/domain/card` since it walks card content directly; the helpers exported
// here are tag-session-shaped (issue #7):
//
//   - `listTagsWithDueCounts` aggregates *Due* cards by tag.
//   - `dueCardsForTagAnd` filters those cards by AND-matching a set of tags.
//
// Pure functions, no Dexie. Callers in `src/db/` and `src/features/` feed them
// pre-loaded `Card[]` arrays (typically the result of a deck-übergreifend
// `listAllDueCards` repository query).

import type { Card } from "@/domain/card";

export { extractTagsFromCards } from "@/domain/card";

export type TagWithDueCount = { tag: string; dueCount: number };

/**
 * Aggregate tags across a list of Due Cards (deck-übergreifend) and count how
 * many of those cards carry each tag.
 *
 * Sort order: descending by `dueCount`; ties broken alphabetically (so the
 * picker has a stable ordering when several tags have the same due-count).
 *
 * The input must already be filtered to Due Cards — this function does not
 * know about Review-State or due-windows. That keeps it pure and lets the
 * caller decide the "now" timestamp.
 */
export function listTagsWithDueCounts(dueCards: readonly Card[]): TagWithDueCount[] {
  const counts = new Map<string, number>();
  for (const card of dueCards) {
    for (const tag of card.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, dueCount]) => ({ tag, dueCount }))
    .sort((a, b) => {
      if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
      return a.tag.localeCompare(b.tag);
    });
}

/**
 * Return Due Cards that carry *all* of the given tags (set intersection over
 * `card.tags`). Order is preserved from the input.
 *
 * Empty `tags` returns an empty array — the Tag-Session-Picker semantics in
 * the issue brief state that 0 selected tags means "no session", *not* "all
 * due cards". That avoids accidentally starting a giant deck-übergreifend
 * session when the user merely opened the picker.
 */
export function dueCardsForTagAnd(dueCards: readonly Card[], tags: readonly string[]): Card[] {
  if (tags.length === 0) return [];
  return dueCards.filter((card) => {
    const cardTags = new Set(card.tags);
    for (const tag of tags) {
      if (!cardTags.has(tag)) return false;
    }
    return true;
  });
}
