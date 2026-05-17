// Pure filename helper for Shared-Deck-Set export. Ticket #23 asks for
// `<deckset-name>-shared.json`. Lives in its own module so the slug logic
// is unit-testable without touching the DOM.
//
// Slug rules mirror `features/shared-deck/filename.ts` — duplicated rather
// than shared so the two sibling features can diverge later without
// reaching into each other's internals.

const SLUG_MAX_LENGTH = 60;

export function slugifyDeckSetName(name: string): string {
  const stripped = name
    .normalize("NFKD")
    // After NFKD, accented latin letters split into a base letter + a
    // combining mark (e.g. "ä" → "a" + U+0308). Strip every combining mark
    // (Unicode category Mn) so we end up with plain ASCII letters.
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
  const hyphenated = stripped.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const capped = hyphenated.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
  return capped.length > 0 ? capped : "deckset";
}

export function sharedDeckSetFilename(deckSetName: string): string {
  return `${slugifyDeckSetName(deckSetName)}-shared.json`;
}
