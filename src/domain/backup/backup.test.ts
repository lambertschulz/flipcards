import { describe, expect, it } from "vitest";

import {
  BACKUP_FORMAT,
  type BackupFileV1,
  CURRENT_BACKUP_FORMAT_VERSION,
  exportBackup,
  parseBackup,
  stringifyBackup,
} from "@/domain/backup";

function expectOk<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) throw new Error(`expected ok, got: ${JSON.stringify(result.error)}`);
  return result.value;
}

function unwrapErr<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): E {
  if (result.ok) throw new Error("expected err, got ok");
  return result.error;
}

const sampleDeckSet = { id: "set-aaaaaaaa", name: "Sprachen", description: "Vokabeln" };

const sampleDeck = {
  id: "deck-aaaaaaaa",
  name: "Französisch A2",
  description: "Voyage en France",
  deckSetId: "set-aaaaaaaa",
  cards: [
    { id: "card-aaaaaaa1", front: "l'ouïe", back: "das Gehör", tags: ["körper"] },
    { id: "card-aaaaaaa2", front: "la main", back: "die Hand", tags: [] },
  ],
};

const sampleReviewState = {
  cardId: "card-aaaaaaa1",
  repetitions: 3,
  easeFactor: 2.5,
  intervalDays: 6,
  nextDue: 1_715_900_000_000,
};

const sampleReviewLog = {
  id: "review-aaaaaaa1",
  cardId: "card-aaaaaaa1",
  timestamp: 1_715_899_000_000,
  rating: "good" as const,
  intervalAfter: 6,
  easeAfter: 2.5,
};

function makeValidBackup(): BackupFileV1 {
  return exportBackup({
    decks: [sampleDeck],
    deckSets: [sampleDeckSet],
    reviewStates: [sampleReviewState],
    reviews: [sampleReviewLog],
    now: () => new Date("2026-05-17T08:00:00Z"),
    appVersion: "0.1.0",
  });
}

describe("exportBackup", () => {
  it("writes the current format and version", () => {
    const file = makeValidBackup();
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.formatVersion).toBe(CURRENT_BACKUP_FORMAT_VERSION);
  });

  it("stamps exportedAt with the provided clock", () => {
    const file = makeValidBackup();
    expect(file.exportedAt).toBe("2026-05-17T08:00:00.000Z");
  });

  it("includes the supplied appVersion (diagnostic)", () => {
    const file = makeValidBackup();
    expect(file.appVersion).toBe("0.1.0");
  });
});

describe("parseBackup — happy path", () => {
  it("round-trips a freshly exported file", () => {
    const original = makeValidBackup();
    const parsed = expectOk(parseBackup(stringifyBackup(original)));
    expect(parsed).toEqual(original);
  });

  it("preserves deck-set membership and SM-2 fields", () => {
    const original = makeValidBackup();
    const parsed = expectOk(parseBackup(stringifyBackup(original)));
    expect(parsed.decks[0].deckSetId).toBe("set-aaaaaaaa");
    expect(parsed.reviewStates[0].easeFactor).toBe(2.5);
  });

  it("round-trips review-log entries (ADR-0012)", () => {
    const extra = {
      id: "review-aaaaaaa2",
      cardId: "card-aaaaaaa2",
      timestamp: 1_715_899_500_000,
      rating: "again" as const,
      intervalAfter: 0,
      easeAfter: 2.3,
    };
    const original = exportBackup({
      decks: [sampleDeck],
      deckSets: [sampleDeckSet],
      reviewStates: [sampleReviewState],
      reviews: [sampleReviewLog, extra],
      now: () => new Date("2026-05-17T08:00:00Z"),
      appVersion: "0.1.0",
    });
    const parsed = expectOk(parseBackup(stringifyBackup(original)));
    expect(parsed.reviews).toEqual([sampleReviewLog, extra]);
  });

  it("accepts an empty backup (no decks, no review data)", () => {
    const empty = exportBackup({
      decks: [],
      deckSets: [],
      reviewStates: [],
      reviews: [],
      now: () => new Date("2026-05-17T08:00:00Z"),
      appVersion: "0.1.0",
    });
    const parsed = expectOk(parseBackup(stringifyBackup(empty)));
    expect(parsed.decks).toEqual([]);
  });
});

describe("parseBackup — discriminated errors", () => {
  it("returns JsonSyntaxError on malformed JSON", () => {
    const e = unwrapErr(parseBackup("{ not json"));
    expect(e.kind).toBe("JsonSyntaxError");
  });

  it("returns UnknownFormat when the `format` field is missing (AC: no formatVersion)", () => {
    const e = unwrapErr(parseBackup(JSON.stringify({ formatVersion: 1 })));
    expect(e.kind).toBe("UnknownFormat");
    if (e.kind === "UnknownFormat") {
      expect(e.expected).toBe(BACKUP_FORMAT);
      expect(e.actual).toBeUndefined();
    }
  });

  it("returns UnknownFormat when a Shared-Deck file is fed in", () => {
    const wrong = JSON.stringify({ format: "flipcards.shared-deck", formatVersion: 1 });
    const e = unwrapErr(parseBackup(wrong));
    expect(e.kind).toBe("UnknownFormat");
    if (e.kind === "UnknownFormat") {
      expect(e.actual).toBe("flipcards.shared-deck");
    }
  });

  it("rejects a file without a formatVersion as IncompatibleVersion", () => {
    // Ticket AC: "Datei ohne formatVersion wird abgelehnt mit klarer
    // Fehlermeldung."
    const noVersion = JSON.stringify({ format: BACKUP_FORMAT });
    const e = unwrapErr(parseBackup(noVersion));
    expect(e.kind).toBe("IncompatibleVersion");
    if (e.kind === "IncompatibleVersion") {
      expect(e.actual).toBeUndefined();
      expect(e.direction).toBe("older-no-migration");
    }
  });

  it("rejects newer-than-current formatVersion with direction=newer", () => {
    const tooNew = JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: CURRENT_BACKUP_FORMAT_VERSION + 1,
      exportedAt: "2030-01-01T00:00:00Z",
      appVersion: "9.9.9",
      decks: [],
      deckSets: [],
      reviewStates: [],
      reviews: [],
    });
    const e = unwrapErr(parseBackup(tooNew));
    expect(e.kind).toBe("IncompatibleVersion");
    if (e.kind === "IncompatibleVersion") {
      expect(e.direction).toBe("newer");
    }
  });

  it("returns SchemaError when a deck has duplicate card ids", () => {
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      decks: [{ ...file.decks[0], cards: [file.decks[0].cards[0], file.decks[0].cards[0]] }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
  });

  it("returns SchemaError when a deck id violates the ID regex", () => {
    const file = makeValidBackup();
    const broken = { ...file, decks: [{ ...file.decks[0], id: "x" }] };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
  });

  it("returns SchemaError when a reviewState references an unknown cardId", () => {
    // Restore wipes-and-replaces (ADR-0011). An orphan review state would
    // survive that gate as learning history attributed to a missing card.
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      reviewStates: [{ ...sampleReviewState, cardId: "card-ghostzz" }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const msg = e.issues.map((i) => i.message).join(" | ");
      expect(msg).toMatch(/reviewStates\.cardId/);
    }
  });

  it("returns SchemaError when a reviews row references an unknown cardId", () => {
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      reviews: [{ ...sampleReviewLog, cardId: "card-ghostzz" }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const msg = e.issues.map((i) => i.message).join(" | ");
      expect(msg).toMatch(/reviews\.cardId/);
    }
  });

  it("returns SchemaError when a deck's deckSetId references an unknown set", () => {
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      decks: [{ ...file.decks[0], deckSetId: "set-ghostzzz" }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const msg = e.issues.map((i) => i.message).join(" | ");
      expect(msg).toMatch(/deckSetId/);
    }
  });

  it("returns SchemaError when two decks share a card id (global uniqueness)", () => {
    const file = makeValidBackup();
    const shared = file.decks[0].cards[0];
    const broken: BackupFileV1 = {
      ...file,
      decks: [file.decks[0], { id: "deck-bbbbbbbb", name: "Andere Sprache", cards: [shared] }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const msg = e.issues.map((i) => i.message).join(" | ");
      expect(msg).toMatch(/card ids must be globally unique/);
    }
  });

  it("returns CardSizeError when a card payload exceeds the ADR-0013 limit", () => {
    // ADR-0013 caps per-Card payload at 5 MB of inlined base64. We forge a
    // single oversized card by embedding a data: URI whose base64 body is
    // larger than the limit. The schema accepts any string for front/back
    // (no per-field size limit); semantic validation in `validate.ts` is the
    // gate.
    const oversized = "A".repeat(5 * 1024 * 1024 + 16);
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      decks: [
        {
          ...file.decks[0],
          cards: [
            {
              ...file.decks[0].cards[0],
              front: `![](data:image/png;base64,${oversized})`,
            },
            file.decks[0].cards[1],
          ],
        },
      ],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("CardSizeError");
    if (e.kind === "CardSizeError") {
      expect(e.violations).toHaveLength(1);
      expect(e.violations[0].cardId).toBe("card-aaaaaaa1");
    }
  });
});
