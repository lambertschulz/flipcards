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

function makeValidBackup(): BackupFileV1 {
  return exportBackup({
    decks: [sampleDeck],
    deckSets: [sampleDeckSet],
    reviewStates: [sampleReviewState],
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
});
