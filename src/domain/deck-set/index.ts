// Deck-Set domain — pure types and logic only. No imports from React, Dexie, Jotai.
// See ADR-0007 (Domain-Layer-Trennung), ADR-0003 (genau zwei Ebenen, jedes Deck in ≤ 1 Set),
// ADR-0014 (Empty Deck-Sets bleiben bestehen) und CONTEXT.md (Deck-Set).

import type { Deck } from "@/domain/deck";

export type DeckSet = {
  id: string;
  name: string;
  description?: string;
};

export class InvalidDeckSetNameError extends Error {
  constructor() {
    super("Deck-Set name must not be empty");
    this.name = "InvalidDeckSetNameError";
  }
}

export function normalizeDeckSetName(raw: string): string {
  return raw.trim();
}

export function isValidDeckSetName(raw: string): boolean {
  return normalizeDeckSetName(raw).length > 0;
}

export type CreateDeckSetInput = {
  id: string;
  name: string;
  description?: string;
};

export function createDeckSet(input: CreateDeckSetInput): DeckSet {
  const name = normalizeDeckSetName(input.name);
  if (!name) throw new InvalidDeckSetNameError();
  return {
    id: input.id,
    name,
    description: normalizeOptionalText(input.description),
  };
}

export type DeckSetPatch = {
  name?: string;
  description?: string;
};

export function updateDeckSet(set: DeckSet, patch: DeckSetPatch): DeckSet {
  const next: DeckSet = { ...set };
  if (patch.name !== undefined) {
    const name = normalizeDeckSetName(patch.name);
    if (!name) throw new InvalidDeckSetNameError();
    next.name = name;
  }
  if (patch.description !== undefined) {
    next.description = normalizeOptionalText(patch.description);
  }
  return next;
}

/**
 * Assign a Deck to a Deck-Set. Pure variant of moveDeckToSet — kept here so
 * the deck-set domain owns the "deck joins set" operation alongside its
 * inverse below. Returns a new Deck; the input is not mutated.
 *
 * Per ADR-0003 every Deck belongs to *at most* one Deck-Set, so this is a
 * straight overwrite of the previous (possibly-undefined) deckSetId.
 */
export function addDeckToSet(deck: Deck, deckSetId: string): Deck {
  return { ...deck, deckSetId };
}

/**
 * Remove a Deck from its Deck-Set. The Deck becomes lose (ADR-0003 allows
 * lose decks explicitly). Returns a new Deck; the input is not mutated.
 * Idempotent: removing a deck that is already lose is a no-op-equivalent.
 */
export function removeDeckFromSet(deck: Deck): Deck {
  const { deckSetId: _drop, ...rest } = deck;
  return rest;
}

function normalizeOptionalText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
