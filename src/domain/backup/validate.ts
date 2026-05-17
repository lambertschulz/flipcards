// Semantic checks that live outside the Zod schema. ADR-0013's 5 MB
// per-Card-payload limit belongs here (not in the schema) so the rule stays
// defined in one place — the Card domain. Same pattern as the shared-deck
// validate module.

import { CardSizeError, validateCardSize } from "@/domain/card";

import type { BackupDeck, BackupFileV1 } from "./schema";

export type CardSizeViolation = {
  deckId: string;
  cardId: string;
  actualBytes: number;
};

function checkDeck(deck: BackupDeck, into: CardSizeViolation[]): void {
  for (const card of deck.cards) {
    try {
      validateCardSize({ ...card, deckId: deck.id });
    } catch (e) {
      if (e instanceof CardSizeError) {
        into.push({ deckId: deck.id, cardId: card.id, actualBytes: e.actualBytes });
        continue;
      }
      throw e;
    }
  }
}

export function validateBackupCardSizes(file: BackupFileV1): CardSizeViolation[] {
  const violations: CardSizeViolation[] = [];
  for (const deck of file.decks) {
    checkDeck(deck, violations);
  }
  return violations;
}
