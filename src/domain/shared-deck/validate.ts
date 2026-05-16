// Semantic checks that live outside the Zod schema. The 5 MB card-size limit
// from ADR-0013 belongs here, not in the schema, so it stays defined in one
// place (the Card domain) instead of being duplicated as a Zod refinement.

import { CardSizeError, validateCardSize } from "@/domain/card";

import type { SharedCard, SharedDeck, SharedDeckSet } from "./schema";

export type CardSizeViolation = {
  deckId: string;
  cardId: string;
  actualBytes: number;
};

export class CardSizesError extends Error {
  readonly violations: readonly CardSizeViolation[];
  constructor(violations: readonly CardSizeViolation[]) {
    super(`${violations.length} card(s) exceed the per-card size limit`);
    this.name = "CardSizesError";
    this.violations = violations;
  }
}

function checkCard(card: SharedCard, deckId: string): CardSizeViolation | null {
  try {
    validateCardSize({ ...card, deckId });
    return null;
  } catch (e) {
    if (e instanceof CardSizeError) {
      return { deckId, cardId: card.id, actualBytes: e.actualBytes };
    }
    throw e;
  }
}

function collectFromDeck(
  deckId: string,
  cards: readonly SharedCard[],
  into: CardSizeViolation[],
): void {
  for (const card of cards) {
    const violation = checkCard(card, deckId);
    if (violation) into.push(violation);
  }
}

export function validateSharedDeckCardSizes(deck: SharedDeck): CardSizeViolation[] {
  const violations: CardSizeViolation[] = [];
  collectFromDeck(deck.deck.id, deck.cards, violations);
  return violations;
}

export function validateSharedDeckSetCardSizes(set: SharedDeckSet): CardSizeViolation[] {
  const violations: CardSizeViolation[] = [];
  for (const entry of set.decks) {
    collectFromDeck(entry.id, entry.cards, violations);
  }
  return violations;
}
