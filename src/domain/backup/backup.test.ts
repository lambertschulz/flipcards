import {
  BACKUP_FORMAT,
  type BackupFileV1,
  CURRENT_BACKUP_FORMAT_VERSION,
  exportBackup,
  parseBackup,
  stringifyBackup,
} from "@/domain/backup";
import { describe, expect, it } from "vitest";

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
    {
      id: "card-aaaaaaa1",
      front: "l'ouïe",
      back: "das Gehör",
      tags: ["körper"],
    },
    {
      id: "card-aaaaaaa2",
      front: "la main",
      back: "die Hand",
      tags: [],
    },
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

  it("includes the app SemVer for diagnostic purposes", () => {
    const file = makeValidBackup();
    // We don't assert a specific value — the version moves with releases.
    // Shape is enough: SemVer-ish string.
    expect(file.appVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("parseBackup — happy path", () => {
  it("accepts a round-tripped export", () => {
    const original = makeValidBackup();
    const parsed = expectOk(parseBackup(stringifyBackup(original)));
    expect(parsed).toEqual(original);
  });

  it("preserves deck-set membership and review-state SM-2 fields", () => {
    const original = makeValidBackup();
    const parsed = expectOk(parseBackup(stringifyBackup(original)));
    expect(parsed.decks[0].deckSetId).toBe("set-aaaaaaaa");
    expect(parsed.reviewStates[0].easeFactor).toBe(2.5);
  });

  it("round-trips review-log entries (ADR-0012: log belongs in Backup)", () => {
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
    });
    const parsed = expectOk(parseBackup(stringifyBackup(original)));
    expect(parsed.reviews).toEqual([sampleReviewLog, extra]);
  });
});

describe("parseBackup — errors as a discriminated union", () => {
  it("returns JsonSyntaxError on malformed JSON", () => {
    const e = unwrapErr(parseBackup("{ not json"));
    expect(e.kind).toBe("JsonSyntaxError");
  });

  it("returns UnknownFormat when the `format` field is missing", () => {
    const e = unwrapErr(parseBackup(JSON.stringify({ formatVersion: 1 })));
    expect(e.kind).toBe("UnknownFormat");
    if (e.kind === "UnknownFormat") {
      expect(e.expected).toBe(BACKUP_FORMAT);
      expect(e.actual).toBeUndefined();
    }
  });

  it("returns UnknownFormat when a Shared-Deck JSON is fed in", () => {
    const wrong = JSON.stringify({
      format: "flipcards.shared-deck",
      formatVersion: 1,
    });
    const e = unwrapErr(parseBackup(wrong));
    expect(e.kind).toBe("UnknownFormat");
    if (e.kind === "UnknownFormat") {
      expect(e.actual).toBe("flipcards.shared-deck");
    }
  });

  it("rejects a file without a formatVersion as IncompatibleVersion", () => {
    // The acceptance criterion explicitly calls out this case: "parseBackup
    // lehnt Files ohne formatVersion ab mit klarer Fehlermeldung."
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
      decks: [
        {
          ...file.decks[0],
          cards: [file.decks[0].cards[0], file.decks[0].cards[0]],
        },
      ],
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
    // Restore wipes-and-replaces the live DB (ADR-0001). A reviewState whose
    // cardId doesn't match any card in any deck would survive that as an
    // orphan row — learning history attributed to a card that no longer
    // exists. The parser must reject it.
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      reviewStates: [{ ...sampleReviewState, cardId: "card-ghostzzz" }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const message = e.issues.map((i) => i.message).join(" | ");
      expect(message).toMatch(/reviewStates\.cardId/);
    }
  });

  it("returns SchemaError when a reviews entry references an unknown cardId", () => {
    // Same rationale as above for the per-rating log (ADR-0012): orphaned
    // log rows would silently inflate heatmap/streak counts after restore.
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      reviews: [{ ...sampleReviewLog, cardId: "card-ghostzzz" }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const message = e.issues.map((i) => i.message).join(" | ");
      expect(message).toMatch(/reviews\.cardId/);
    }
  });

  it("returns SchemaError when a deck's deckSetId references an unknown deck-set", () => {
    // A deck pointing at a missing deck-set would render as "ungrouped" in
    // the UI on restore but still carry the broken pointer in storage. We
    // refuse the file outright rather than silently dropping the reference.
    const file = makeValidBackup();
    const broken: BackupFileV1 = {
      ...file,
      decks: [{ ...file.decks[0], deckSetId: "set-ghostzzz" }],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const message = e.issues.map((i) => i.message).join(" | ");
      expect(message).toMatch(/deckSetId/);
    }
  });

  it("returns SchemaError when two decks share a card id (global uniqueness)", () => {
    // Card ids are the primary key on the Dexie `cards` table — duplicates
    // across decks would silently overwrite on restore. The schema must
    // enforce global uniqueness, not just per-deck.
    const file = makeValidBackup();
    const sharedCard = file.decks[0].cards[0];
    const broken: BackupFileV1 = {
      ...file,
      decks: [
        file.decks[0],
        {
          id: "deck-bbbbbbbb",
          name: "Andere Sprache",
          cards: [sharedCard],
        },
      ],
    };
    const e = unwrapErr(parseBackup(JSON.stringify(broken)));
    expect(e.kind).toBe("SchemaError");
    if (e.kind === "SchemaError") {
      const message = e.issues.map((i) => i.message).join(" | ");
      expect(message).toMatch(/card ids must be globally unique/);
    }
  });
});
