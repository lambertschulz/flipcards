import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SHARED_DECK_FORMAT,
  SHARED_DECK_SET_FORMAT,
  type SharedDeck,
  type SharedDeckSet,
  stringifySharedDeck,
  stringifySharedDeckSet,
} from "@/domain/shared-deck";

import { loadCuratedManifest, loadCuratedPayload } from "./library";

function makeResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, { status: 200, ...init });
}

describe("loadCuratedManifest", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses an empty manifest", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(JSON.stringify({ entries: [] })));
    const result = await loadCuratedManifest();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries).toEqual([]);
  });

  it("parses a manifest with one entry", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(
        JSON.stringify({
          entries: [
            {
              slug: "french",
              kind: "deck",
              title: "French",
              cardCount: 10,
              curatedSourceId: "fr-1",
              version: 1,
            },
          ],
        }),
      ),
    );
    const result = await loadCuratedManifest();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0].slug).toBe("french");
    }
  });

  it("returns a FetchError when the response is not OK", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404, statusText: "Not Found" }));
    const result = await loadCuratedManifest();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("FetchError");
  });

  it("returns a JsonSyntaxError on malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse("{ broken"));
    const result = await loadCuratedManifest();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("JsonSyntaxError");
  });

  it("returns a SchemaError when the manifest fails validation", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(
        JSON.stringify({
          entries: [
            {
              slug: "x",
              kind: "deck",
              title: "x",
              cardCount: -1,
              curatedSourceId: "x",
              version: 1,
            },
          ],
        }),
      ),
    );
    const result = await loadCuratedManifest();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("SchemaError");
  });
});

describe("loadCuratedPayload", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and parses a SharedDeck payload", async () => {
    const deck: SharedDeck = {
      format: SHARED_DECK_FORMAT,
      formatVersion: 1,
      exportedAt: "2026-05-17T08:00:00Z",
      deck: { id: "deck-curated1", name: "Curated Deck" },
      cards: [{ id: "card-curated1", front: "f", back: "b", tags: [] }],
    };
    fetchMock.mockResolvedValueOnce(makeResponse(stringifySharedDeck(deck)));

    const result = await loadCuratedPayload("french", "deck");
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "deck") {
      expect(result.value.payload.deck.id).toBe("deck-curated1");
    }
  });

  it("loads and parses a SharedDeckSet payload", async () => {
    const set: SharedDeckSet = {
      format: SHARED_DECK_SET_FORMAT,
      formatVersion: 1,
      exportedAt: "2026-05-17T08:00:00Z",
      deckSet: { id: "set-curated1", name: "Curated Set" },
      decks: [
        {
          id: "deck-curated1",
          name: "Curated Deck",
          cards: [{ id: "card-curated1", front: "f", back: "b", tags: [] }],
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(makeResponse(stringifySharedDeckSet(set)));

    const result = await loadCuratedPayload("medicine", "deck-set");
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "deck-set") {
      expect(result.value.payload.deckSet.id).toBe("set-curated1");
    }
  });

  it("returns an ImportError when the payload fails validation", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(JSON.stringify({ format: "wrong" })));
    const result = await loadCuratedPayload("x", "deck");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("ImportError");
  });

  it("returns a FetchError when the payload is not reachable", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404, statusText: "Not Found" }));
    const result = await loadCuratedPayload("x", "deck");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("FetchError");
  });
});
