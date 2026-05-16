// Deck domain — pure types and logic only. No imports from React, Dexie, Jotai.
// See ADR-0007 (Domain-Layer-Trennung) and CONTEXT.md (Deck).

export type Deck = {
  id: string;
  name: string;
  description?: string;
  deckSetId?: string;
};

export class InvalidDeckNameError extends Error {
  constructor() {
    super("Deck name must not be empty");
    this.name = "InvalidDeckNameError";
  }
}

export function normalizeDeckName(raw: string): string {
  return raw.trim();
}

export function isValidDeckName(raw: string): boolean {
  return normalizeDeckName(raw).length > 0;
}

export type CreateDeckInput = {
  id: string;
  name: string;
  description?: string;
  deckSetId?: string | null;
};

export function createDeck(input: CreateDeckInput): Deck {
  const name = normalizeDeckName(input.name);
  if (!name) throw new InvalidDeckNameError();
  return {
    id: input.id,
    name,
    description: normalizeOptionalText(input.description),
    deckSetId: input.deckSetId ?? undefined,
  };
}

export type DeckPatch = {
  name?: string;
  description?: string;
};

export function updateDeck(deck: Deck, patch: DeckPatch): Deck {
  const next: Deck = { ...deck };
  if (patch.name !== undefined) {
    const name = normalizeDeckName(patch.name);
    if (!name) throw new InvalidDeckNameError();
    next.name = name;
  }
  if (patch.description !== undefined) {
    next.description = normalizeOptionalText(patch.description);
  }
  return next;
}

export function moveDeckToSet(deck: Deck, deckSetId: string | null): Deck {
  return { ...deck, deckSetId: deckSetId ?? undefined };
}

function normalizeOptionalText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
