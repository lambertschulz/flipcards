// Deck-Set domain — pure types and logic only. No imports from React, Dexie, Jotai.
// See ADR-0007 (Domain-Layer-Trennung) and CONTEXT.md (Deck-Set).

export type DeckSet = {
  id: string;
  name: string;
};
