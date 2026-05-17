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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/database";
import { MAX_CARD_PAYLOAD_BYTES } from "@/domain/card";
import { SHARED_DECK_FORMAT, type SharedDeck, stringifySharedDeck } from "@/domain/shared-deck";
import { SharedDeckImportPage } from "./shared-deck-import-page";

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/shared-deck/import",
    component: SharedDeckImportPage,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: function DeckRouteComponent() {
      const { deckId } = deckRoute.useParams();
      return <div data-testid="deck-detail">Deck: {deckId}</div>;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([importRoute, deckRoute]),
    history: createMemoryHistory({ initialEntries: ["/shared-deck/import"] }),
  });
  await router.load();
  return router;
}

function makeFile(name: string, contents: string): File {
  return new File([contents], name, { type: "application/json" });
}

function makeSharedDeckJson(overrides: Partial<SharedDeck> = {}): string {
  const file: SharedDeck = {
    format: SHARED_DECK_FORMAT,
    formatVersion: 1,
    exportedAt: "2026-05-17T08:00:00Z",
    deck: { id: "deck-fromfile1", name: "Imported Shared", description: "Test" },
    cards: [{ id: "card-fromfile1", front: "f", back: "b", tags: ["t"] }],
    ...overrides,
  };
  return stringifySharedDeck(file);
}

describe("SharedDeckImportPage", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("renders an error when the picked file is missing `formatVersion`", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-file-input")) as HTMLInputElement;
    const bad = makeFile(
      "nope.json",
      JSON.stringify({ format: SHARED_DECK_FORMAT, deck: {}, cards: [] }),
    );

    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } });
    });

    const alert = await screen.findByTestId("shared-deck-import-error");
    expect(alert.textContent).toMatch(/formatVersion/);
  });

  it("renders an error when JSON is malformed", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-file-input")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("x.json", "{ broken")] } });
    });

    const alert = await screen.findByTestId("shared-deck-import-error");
    expect(alert.textContent).toMatch(/JSON/);
  });

  it("rejects cards larger than 5 MB and lists them in the error message", async () => {
    const oversized = "A".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    const json = makeSharedDeckJson({
      cards: [
        {
          id: "card-fromfile1",
          front: `![big](data:image/png;base64,${oversized})`,
          back: "",
          tags: [],
        },
      ],
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-file-input")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("big.json", json)] } });
    });

    const alert = await screen.findByTestId("shared-deck-import-error");
    expect(alert.textContent).toMatch(/5-MB-Limit/);
    expect(alert.textContent).toMatch(/card-fromfile1/);
    // No deck should have been written.
    expect(await db.decks.count()).toBe(0);
  });

  it("imports successfully and shows a summary toast", async () => {
    const json = makeSharedDeckJson();

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-file-input")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("ok.json", json)] } });
    });

    await waitFor(async () => {
      expect(await screen.findByTestId("shared-deck-import-success")).toBeInTheDocument();
    });

    expect((await db.decks.get("deck-fromfile1"))?.name).toBe("Imported Shared");
    expect(await db.cards.count()).toBe(1);
  });
});
