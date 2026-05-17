// Pure filename helper for Shared-Deck export. Ticket #22 asks for
// `<deck-name>-shared.json`. Lives in its own module so the slug logic is
// unit-testable without touching the DOM.

// Slug rules (intentionally simple — readable, ASCII-safe, never empty):
//   1. Lowercase + NFKD-strip accents so "Französisch" → "franzosisch".
//   2. Replace any run of non-`[a-z0-9]` with a single hyphen.
//   3. Trim leading/trailing hyphens.
//   4. Cap at 60 chars so the filename stays comfortably under typical
//      FS limits even with the `-shared.json` suffix.
//   5. Fall back to "deck" if the result is empty (deck named "###", etc.).
const SLUG_MAX_LENGTH = 60;

export function slugifyDeckName(name: string): string {
  const stripped = name
    .normalize("NFKD")
    // After NFKD, accented latin letters split into a base letter + a
    // combining mark (e.g. "ä" → "a" + U+0308). Strip every combining mark
    // (Unicode category Mn) so we end up with plain ASCII letters.
    // Property-escape (`\p{Mn}`) instead of a literal range so biome's
    // `noMisleadingCharacterClass` doesn't fire.
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
  const hyphenated = stripped.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const capped = hyphenated.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
  return capped.length > 0 ? capped : "deck";
}

export function sharedDeckFilename(deckName: string): string {
  return `${slugifyDeckName(deckName)}-shared.json`;
}
