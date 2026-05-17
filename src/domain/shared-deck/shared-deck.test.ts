import { MAX_CARD_PAYLOAD_BYTES } from "@/domain/card";
import {
  type SharedDeck,
  type SharedDeckSet,
  parseSharedDeck,
  parseSharedDeckSet,
  stringifySharedDeck,
  stringifySharedDeckSet,
} from "@/domain/shared-deck";
import { describe, expect, it } from "vitest";

import sharedDeckSetFixture from "./__fixtures__/shared-deck-set.example.json" with {
  type: "json",
};
import sharedDeckFixture from "./__fixtures__/shared-deck.example.json" with { type: "json" };

// JSON.stringify drops `undefined` fields, so the fixture (no optionals on the
// inner Italian deck) round-trips cleanly even when typed as SharedDeck/Set.
const deckFixtureJson = JSON.stringify(sharedDeckFixture);
const deckSetFixtureJson = JSON.stringify(sharedDeckSetFixture);

function expectOk<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) throw new Error(`expected ok, got: ${JSON.stringify(result.error)}`);
  return result.value;
}

function unwrapErr<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): E {
  if (result.ok) throw new Error("expected err, got ok");
  return result.error;
}

describe("parseSharedDeck — happy path", () => {
  it("accepts the ADR-0018 normative example", () => {
    const deck = expectOk(parseSharedDeck(deckFixtureJson));
    expect(deck.format).toBe("flipcards.shared-deck");
    expect(deck.formatVersion).toBe(1);
    expect(deck.deck.name).toBe("Französisch — Vokabeln A2");
    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0].tags).toEqual(["körper", "prüfung"]);
  });

  it("round-trips parse ∘ stringify", () => {
    const deck = expectOk(parseSharedDeck(deckFixtureJson));
    const reparsed = expectOk(parseSharedDeck(stringifySharedDeck(deck)));
    expect(reparsed).toEqual(deck);
  });
});

describe("parseSharedDeckSet — happy path", () => {
  it("accepts a deck-set with two inner decks", () => {
    const set = expectOk(parseSharedDeckSet(deckSetFixtureJson));
    expect(set.format).toBe("flipcards.shared-deck-set");
    expect(set.decks).toHaveLength(2);
    expect(set.decks[0].cards[0].front).toBe("l'ouïe");
  });

  it("round-trips parse ∘ stringify", () => {
    const set = expectOk(parseSharedDeckSet(deckSetFixtureJson));
    const reparsed = expectOk(parseSharedDeckSet(stringifySharedDeckSet(set)));
    expect(reparsed).toEqual(set);
  });
});

describe("Pipeline errors — discriminated union", () => {
  it("returns JsonSyntaxError on malformed JSON", () => {
    const e = unwrapErr(parseSharedDeck("{ not json"));
    expect(e.kind).toBe("JsonSyntaxError");
  });

  it("returns UnknownFormat when the `format` field is missing", () => {
    const e = unwrapErr(parseSharedDeck(JSON.stringify({ formatVersion: 1 })));
    expect(e.kind).toBe("UnknownFormat");
    if (e.kind === "UnknownFormat") {
      expect(e.expected).toBe("flipcards.shared-deck");
      expect(e.actual).toBeUndefined();
    }
  });

  it("returns UnknownFormat when the wrong file type is parsed", () => {
    // Feed a shared-deck-set JSON into parseSharedDeck.
    const e = unwrapErr(parseSharedDeck(deckSetFixtureJson));
    expect(e.kind).toBe("UnknownFormat");
    if (e.kind === "UnknownFormat") {
      expect(e.actual).toBe("flipcards.shared-deck-set");
    }
  });

  it("returns IncompatibleVersion (newer) when formatVersion > current", () => {
    const future = { ...sharedDeckFixture, formatVersion: 99 };
    const e = unwrapErr(parseSharedDeck(JSON.stringify(future)));
    expect(e.kind).toBe("IncompatibleVersion");
    if (e.kind === "IncompatibleVersion") {
      expect(e.direction).toBe("newer");
      expect(e.expected).toBe(1);
      expect(e.actual).toBe(99);
    }
  });

  it("returns IncompatibleVersion (older-no-migration) when no migration is registered", () => {
    // formatVersion 0 is below v1 — v1 has no migration table entries yet.
    const ancient = { ...sharedDeckFixture, formatVersion: 0 };
    const e = unwrapErr(parseSharedDeck(JSON.stringify(ancient)));
    expect(e.kind).toBe("IncompatibleVersion");
    if (e.kind === "IncompatibleVersion") {
      expect(e.direction).toBe("older-no-migration");
    }
  });

  it("returns SchemaError when the deck id is too short", () => {
    const bad = {
      ...sharedDeckFixture,
      deck: { ...sharedDeckFixture.deck, id: "short" },
    };
    const e = unwrapErr(parseSharedDeck(JSON.stringify(bad)));
    expect(e.kind).toBe("SchemaError");
  });
});

describe("Schema rules — one negative case per rule", () => {
  function mutate(input: SharedDeck, mutator: (d: SharedDeck) => void): string {
    const clone = JSON.parse(JSON.stringify(input)) as SharedDeck;
    mutator(clone);
    return JSON.stringify(clone);
  }

  it("rejects ids that don't match /^[A-Za-z0-9_-]{8,}$/", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.deck.id = "has spaces";
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects empty deck name", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.deck.name = "   ";
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects deck name longer than 200 chars after trim", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.deck.name = "x".repeat(201);
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects tags with leading/trailing whitespace", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.cards[0].tags = [" untrimmed"];
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects empty tag strings", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.cards[0].tags = [""];
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects duplicate tags within a card", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.cards[0].tags = ["körper", "körper"];
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects tags longer than 64 characters", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.cards[0].tags = ["x".repeat(65)];
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects two cards with the same id inside the same deck", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.cards = [d.cards[0], { ...d.cards[0] }];
    });
    expect(unwrapErr(parseSharedDeck(json)).kind).toBe("SchemaError");
  });

  it("rejects a SharedDeckSet whose two decks share a card id (globally unique)", () => {
    const set = JSON.parse(JSON.stringify(sharedDeckSetFixture)) as SharedDeckSet;
    // Force a collision: copy a card from deck 0 into deck 1 with the same id.
    const stolen = JSON.parse(
      JSON.stringify(set.decks[0].cards[0]),
    ) as SharedDeckSet["decks"][number]["cards"][number];
    set.decks[1].cards = [stolen, ...set.decks[1].cards];
    const e = unwrapErr(parseSharedDeckSet(JSON.stringify(set)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const messages = e.issues.map((i) => i.message).join(" | ");
      expect(messages).toContain("globally unique across the deck-set");
    }
  });

  it("accepts empty front and back (cloze-style notes are not blocked)", () => {
    const json = mutate(sharedDeckFixture as SharedDeck, (d) => {
      d.cards[0].front = "";
      d.cards[0].back = "";
    });
    const deck = expectOk(parseSharedDeck(json));
    expect(deck.cards[0].front).toBe("");
  });
});

describe("CardSizeError — separate from SchemaError", () => {
  it("fires when a card's base64 payload exceeds 5 MB, not as SchemaError", () => {
    const oversized = "A".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    const inflated = {
      ...sharedDeckFixture,
      cards: [
        {
          ...sharedDeckFixture.cards[0],
          front: `![big](data:image/png;base64,${oversized})`,
        },
      ],
    };
    const e = unwrapErr(parseSharedDeck(JSON.stringify(inflated)));
    expect(e.kind).toBe("CardSizeError");
    if (e.kind === "CardSizeError") {
      expect(e.violations).toHaveLength(1);
      expect(e.violations[0].cardId).toBe(sharedDeckFixture.cards[0].id);
      expect(e.violations[0].actualBytes).toBeGreaterThan(MAX_CARD_PAYLOAD_BYTES);
    }
  });

  it("reports per-deck violations for shared-deck-set", () => {
    const oversized = "A".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    const set = JSON.parse(JSON.stringify(sharedDeckSetFixture)) as SharedDeckSet;
    set.decks[1].cards[0].back = `![x](data:image/png;base64,${oversized})`;
    const e = unwrapErr(parseSharedDeckSet(JSON.stringify(set)));
    expect(e.kind).toBe("CardSizeError");
    if (e.kind === "CardSizeError") {
      expect(e.violations[0].deckId).toBe(set.decks[1].id);
    }
  });
});

describe("Version pipeline wiring", () => {
  it("accepts the current formatVersion without migration", () => {
    // The migration table is empty in v1, but the pipeline still gates on
    // formatVersion. This test pins the wiring: a v2 bump only adds an entry
    // to migrate.ts; nothing else moves.
    const deck = expectOk(parseSharedDeck(deckFixtureJson));
    expect(deck.formatVersion).toBe(1);
  });

  it("treats non-integer formatVersion as an older-no-migration error", () => {
    const garbled = { ...sharedDeckFixture, formatVersion: "1" };
    const e = unwrapErr(parseSharedDeck(JSON.stringify(garbled)));
    expect(e.kind).toBe("IncompatibleVersion");
  });
});
