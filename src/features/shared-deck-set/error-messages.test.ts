import { describe, expect, it } from "vitest";

import type { ImportError } from "@/domain/shared-deck";

import { describeSharedDeckSetError } from "./error-messages";

describe("describeSharedDeckSetError", () => {
  it("mentions 'formatVersion' when the field is missing (ticket AC)", () => {
    const error: ImportError = {
      kind: "IncompatibleVersion",
      expected: 1,
      actual: undefined,
      direction: "older-no-migration",
    };
    expect(describeSharedDeckSetError(error)).toMatch(/formatVersion/);
  });

  it("nudges the user toward a Shared-Deck-Set file when 'format' is missing", () => {
    const error: ImportError = {
      kind: "UnknownFormat",
      expected: "flipcards.shared-deck-set",
      actual: undefined,
    };
    expect(describeSharedDeckSetError(error)).toMatch(/Shared-Deck-Set/);
  });

  it("lists every oversized card up to MAX_VIOLATION_LINES (ticket AC)", () => {
    const violations = Array.from({ length: 3 }, (_, i) => ({
      deckId: "deck-aaaaaaaa",
      cardId: `card-${i}`,
      actualBytes: 6 * 1024 * 1024,
    }));
    const error: ImportError = { kind: "CardSizeError", violations };
    const text = describeSharedDeckSetError(error);
    expect(text).toMatch(/card-0/);
    expect(text).toMatch(/card-1/);
    expect(text).toMatch(/card-2/);
    expect(text).toMatch(/3 Card/);
    // Per-card line includes the originating deck id so the user can find it.
    expect(text).toMatch(/deck-aaaaaaaa/);
  });

  it("truncates the listed violations and adds a '+N weitere' tail", () => {
    const violations = Array.from({ length: 15 }, (_, i) => ({
      deckId: "deck-aaaaaaaa",
      cardId: `card-${i}`,
      actualBytes: 6 * 1024 * 1024,
    }));
    const error: ImportError = { kind: "CardSizeError", violations };
    const text = describeSharedDeckSetError(error);
    expect(text).toMatch(/\(\+5 weitere\)/);
  });
});
