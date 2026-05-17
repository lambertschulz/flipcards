import { describe, expect, it } from "vitest";

import type { ImportError } from "@/domain/shared-deck";

import { describeSharedDeckError } from "./error-messages";

describe("describeSharedDeckError", () => {
  it("mentions 'formatVersion' when the field is missing (ticket AC)", () => {
    const error: ImportError = {
      kind: "IncompatibleVersion",
      expected: 1,
      actual: undefined,
      direction: "older-no-migration",
    };
    expect(describeSharedDeckError(error)).toMatch(/formatVersion/);
  });

  it("nudges the user toward a Shared-Deck file when 'format' is missing", () => {
    const error: ImportError = {
      kind: "UnknownFormat",
      expected: "flipcards.shared-deck",
      actual: undefined,
    };
    expect(describeSharedDeckError(error)).toMatch(/Shared-Deck/);
  });

  it("lists every oversized card up to MAX_VIOLATION_LINES (ticket AC)", () => {
    const violations = Array.from({ length: 3 }, (_, i) => ({
      deckId: "deck-aaaaaaaa",
      cardId: `card-${i}`,
      actualBytes: 6 * 1024 * 1024,
    }));
    const error: ImportError = { kind: "CardSizeError", violations };
    const text = describeSharedDeckError(error);
    expect(text).toMatch(/card-0/);
    expect(text).toMatch(/card-1/);
    expect(text).toMatch(/card-2/);
    expect(text).toMatch(/3 Card/);
  });

  it("truncates the listed violations and adds a '+N weitere' tail", () => {
    const violations = Array.from({ length: 15 }, (_, i) => ({
      deckId: "deck-aaaaaaaa",
      cardId: `card-${i}`,
      actualBytes: 6 * 1024 * 1024,
    }));
    const error: ImportError = { kind: "CardSizeError", violations };
    const text = describeSharedDeckError(error);
    expect(text).toMatch(/\(\+5 weitere\)/);
  });
});
