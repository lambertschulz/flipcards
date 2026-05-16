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
