// Card domain — pure types and logic only. No imports from React, Dexie, Jotai.
// See ADR-0007 (Domain-Layer-Trennung), ADR-0005 (Card-Modell v1),
// ADR-0013 (Bild-Policy), ADR-0018 (Shared-Deck-JSON-Format).

export type Card = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  tags: string[];
};

export const MAX_TAG_LENGTH = 64;
export const MAX_CARD_PAYLOAD_BYTES = 5 * 1024 * 1024;

export class TagTooLongError extends Error {
  readonly tag: string;

  constructor(tag: string) {
    super(`Tag exceeds ${MAX_TAG_LENGTH} characters after trim`);
    this.name = "TagTooLongError";
    this.tag = tag;
  }
}

export class CardSizeError extends Error {
  readonly actualBytes: number;

  constructor(actualBytes: number) {
    super(
      `Card payload (${actualBytes} bytes) exceeds the ${MAX_CARD_PAYLOAD_BYTES}-byte limit (ADR-0013)`,
    );
    this.name = "CardSizeError";
    this.actualBytes = actualBytes;
  }
}

export function normalizeTag(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  if (collapsed.length > MAX_TAG_LENGTH) throw new TagTooLongError(collapsed);
  return collapsed;
}

export function normalizeTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const tag = normalizeTag(candidate);
    if (tag === null) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export type CreateCardInput = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  tags?: string[];
};

export function createCard(input: CreateCardInput): Card {
  return {
    id: input.id,
    deckId: input.deckId,
    front: input.front,
    back: input.back,
    tags: normalizeTags(input.tags ?? []),
  };
}

export type CardPatch = {
  front?: string;
  back?: string;
  tags?: string[];
};

export function updateCard(card: Card, patch: CardPatch): Card {
  const next: Card = { ...card, tags: [...card.tags] };
  if (patch.front !== undefined) next.front = patch.front;
  if (patch.back !== undefined) next.back = patch.back;
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  return next;
}

// Matches the base64 payload of a data: URI. Stops at the first character that
// can't appear in a base64 alphabet, so we don't accidentally pull in trailing
// markdown like `)` from `![](data:...;base64,XYZ)`.
const DATA_URI_BASE64_RE = /data:[^;,\s]+;base64,([A-Za-z0-9+/=]+)/g;

export function validateCardSize(card: Card): void {
  const total = sumDataUriBase64Bytes(card.front) + sumDataUriBase64Bytes(card.back);
  if (total > MAX_CARD_PAYLOAD_BYTES) throw new CardSizeError(total);
}

function sumDataUriBase64Bytes(markdown: string): number {
  let total = 0;
  for (const match of markdown.matchAll(DATA_URI_BASE64_RE)) {
    total += match[1].length;
  }
  return total;
}

export type CardStatusFilter = "all" | "due";

export type FilterCardsOptions = {
  query?: string;
  tags?: string[];
  status?: CardStatusFilter;
  /**
   * IDs of cards considered Due at the moment of filtering. Required only when
   * `status === "due"`. The domain layer does not know about Review-State or
   * the current time — the caller resolves which cards are due (typically via
   * `listDueCardsInDeck` in `db/review-states.ts`) and passes the resulting
   * id-set here. Pure-function purity is preserved.
   */
  dueCardIds?: ReadonlySet<string>;
};

/**
 * Apply the deck-detail filter combination (issue #10) to a list of cards.
 *
 * AND-semantics across all three filters:
 *   - `query`  — case-insensitive substring match on `front` *or* `back`
 *                (Markdown source, not rendered HTML). Whitespace-only and
 *                empty queries are treated as "no query".
 *   - `tags`   — multi-select AND: a card must carry *all* given tags.
 *                Empty array means "no tag filter" (cf. `dueCardsForTagAnd`,
 *                which uses the opposite convention because its caller is
 *                the Tag-Session-Picker; here the filter bar is additive,
 *                so an empty tag-set must be a no-op).
 *   - `status` — `"all"` (default) or `"due"`. When `"due"`, the caller must
 *                supply `dueCardIds`.
 *
 * Input order is preserved.
 */
export function filterCards(cards: readonly Card[], options: FilterCardsOptions = {}): Card[] {
  const needle = (options.query ?? "").trim().toLowerCase();
  const requiredTags = options.tags ?? [];
  const status = options.status ?? "all";
  const dueIds = options.dueCardIds;

  return cards.filter((card) => {
    if (needle.length > 0) {
      const front = card.front.toLowerCase();
      const back = card.back.toLowerCase();
      if (!front.includes(needle) && !back.includes(needle)) return false;
    }
    if (requiredTags.length > 0) {
      const cardTags = new Set(card.tags);
      for (const tag of requiredTags) {
        if (!cardTags.has(tag)) return false;
      }
    }
    if (status === "due") {
      if (!dueIds || !dueIds.has(card.id)) return false;
    }
    return true;
  });
}

/**
 * Per-tag card counts under the *currently applied* search + status filter,
 * ignoring the tag selection itself. Used to drive the "count" badge on each
 * tag chip in the deck-detail filter bar: it answers "how many cards would
 * I see if I added this tag to the filter?" — independent of which other
 * tags are already selected, but constrained by the query and status.
 *
 * Returns counts in `card.tags` first-occurrence order (matches
 * `extractTagsFromCards`), so the chip ordering stays stable as the user
 * types.
 */
export function tagCountsForFilter(
  cards: readonly Card[],
  options: Omit<FilterCardsOptions, "tags"> = {},
): Array<{ tag: string; count: number }> {
  const prefiltered = filterCards(cards, { ...options, tags: [] });
  return extractTagsFromCards(prefiltered as Card[]);
}

export function extractTagsFromCards(cards: Card[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const card of cards) {
    for (const tag of card.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
      if (!firstSeen.has(tag)) {
        firstSeen.set(tag, order++);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (firstSeen.get(a.tag) ?? 0) - (firstSeen.get(b.tag) ?? 0);
    });
}
