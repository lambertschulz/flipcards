import "fake-indexeddb/auto";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/database";
import {
  SHARED_DECK_FORMAT,
  SHARED_DECK_SET_FORMAT,
  type SharedDeck,
  type SharedDeckSet,
  stringifySharedDeck,
  stringifySharedDeckSet,
} from "@/domain/shared-deck";

import { CuratedDetailPage } from "./curated-detail-page";

async function setupRouter(slug: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/curated/$slug",
    component: function DetailRouteComponent() {
      const { slug: s } = detailRoute.useParams();
      return <CuratedDetailPage slug={s} />;
    },
  });
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/curated",
    component: () => <div data-testid="library">Library</div>,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: function DeckRouteComponent() {
      const { deckId } = deckRoute.useParams();
      return <div data-testid="deck-detail">Deck: {deckId}</div>;
    },
  });
  const deckSetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/$deckSetId",
    component: function DeckSetRouteComponent() {
      const { deckSetId } = deckSetRoute.useParams();
      return <div data-testid="deck-set-detail">Set: {deckSetId}</div>;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute, libraryRoute, deckRoute, deckSetRoute]),
    history: createMemoryHistory({ initialEntries: [`/curated/${slug}`] }),
  });
  await router.load();
  return router;
}

function makeResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, { status: 200, ...init });
}

const manifestWithOneDeckEntry = {
  entries: [
    {
      slug: "french",
      kind: "deck",
      title: "Französisch",
      description: "Vokabeln zum Aufwärmen",
      language: "fr",
      cardCount: 1,
      curatedSourceId: "fr",
      version: 3,
      license: "CC-BY-SA 4.0",
    },
  ],
};

const manifestWithOneSetEntry = {
  entries: [
    {
      slug: "medicine",
      kind: "deck-set",
      title: "Medizin",
      cardCount: 1,
      curatedSourceId: "med",
      version: 1,
    },
  ],
};

const sampleSharedDeck: SharedDeck = {
  format: SHARED_DECK_FORMAT,
  formatVersion: 1,
  exportedAt: "2026-05-17T08:00:00Z",
  deck: { id: "deck-curated1", name: "Französisch (Bundle)" },
  cards: [{ id: "card-curated1", front: "Bonjour", back: "Hello", tags: [] }],
};

const sampleSharedDeckSet: SharedDeckSet = {
  format: SHARED_DECK_SET_FORMAT,
  formatVersion: 1,
  exportedAt: "2026-05-17T08:00:00Z",
  deckSet: { id: "set-curated1", name: "Medizin (Bundle)" },
  decks: [
    {
      id: "deck-curated2",
      name: "Anatomie",
      cards: [{ id: "card-curated2", front: "Femur", back: "Oberschenkel", tags: [] }],
    },
  ],
};

describe("CuratedDetailPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await db.open();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete();
  });

  it("shows a not-found banner when the slug is unknown", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(JSON.stringify({ entries: [] })));

    const router = await setupRouter("ghost");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("curated-detail-not-found")).toBeInTheDocument();
    });
  });

  it("renders the entry's metadata including license", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(JSON.stringify(manifestWithOneDeckEntry)));

    const router = await setupRouter("french");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("curated-detail")).toBeInTheDocument();
    });
    expect(screen.getByText("Französisch")).toBeInTheDocument();
    expect(screen.getByText("Vokabeln zum Aufwärmen")).toBeInTheDocument();
    expect(screen.getByTestId("curated-detail-license").textContent).toMatch(/CC-BY-SA/);
  });

  it("imports a SharedDeck payload via the existing apply pipeline", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(JSON.stringify(manifestWithOneDeckEntry)))
      .mockResolvedValueOnce(makeResponse(stringifySharedDeck(sampleSharedDeck)));

    const router = await setupRouter("french");
    render(<RouterProvider router={router} />);

    const button = await screen.findByTestId("curated-import-button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByTestId("curated-import-success")).toBeInTheDocument();
    });

    // The deck must now be persisted in IndexedDB exactly as a regular import
    // would land it — no curated-specific treatment afterwards.
    expect((await db.decks.get("deck-curated1"))?.name).toBe("Französisch (Bundle)");
    expect(await db.cards.count()).toBe(1);
  });

  it("imports a SharedDeckSet payload via the deck-set apply pipeline", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(JSON.stringify(manifestWithOneSetEntry)))
      .mockResolvedValueOnce(makeResponse(stringifySharedDeckSet(sampleSharedDeckSet)));

    const router = await setupRouter("medicine");
    render(<RouterProvider router={router} />);

    const button = await screen.findByTestId("curated-import-button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByTestId("curated-import-success")).toBeInTheDocument();
    });

    expect((await db.deckSets.get("set-curated1"))?.name).toBe("Medizin (Bundle)");
    expect((await db.decks.get("deck-curated2"))?.name).toBe("Anatomie");
    expect(await db.cards.count()).toBe(1);
  });

  it("shows an import-error banner when the payload payload is malformed", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(JSON.stringify(manifestWithOneDeckEntry)))
      .mockResolvedValueOnce(makeResponse("{ broken"));

    const router = await setupRouter("french");
    render(<RouterProvider router={router} />);

    const button = await screen.findByTestId("curated-import-button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByTestId("curated-detail-import-error")).toBeInTheDocument();
    });
    // No deck should have been written.
    expect(await db.decks.count()).toBe(0);
  });

  it("shows a manifest-error banner when the manifest fetch fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 500, statusText: "Server Error" }),
    );

    const router = await setupRouter("anything");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("curated-detail-manifest-error")).toBeInTheDocument();
    });
  });
});
