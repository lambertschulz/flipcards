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
import {
  SHARED_DECK_SET_FORMAT,
  type SharedDeckSet,
  stringifySharedDeckSet,
} from "@/domain/shared-deck";
import { SharedDeckSetImportPage } from "./shared-deck-set-import-page";

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/shared-deck-set/import",
    component: SharedDeckSetImportPage,
  });
  const setRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/$deckSetId",
    component: function SetRouteComponent() {
      const { deckSetId } = setRoute.useParams();
      return <div data-testid="set-detail">Set: {deckSetId}</div>;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([importRoute, setRoute]),
    history: createMemoryHistory({ initialEntries: ["/shared-deck-set/import"] }),
  });
  await router.load();
  return router;
}

function makeFile(name: string, contents: string): File {
  return new File([contents], name, { type: "application/json" });
}

function makeSharedDeckSetJson(overrides: Partial<SharedDeckSet> = {}): string {
  const file: SharedDeckSet = {
    format: SHARED_DECK_SET_FORMAT,
    formatVersion: 1,
    exportedAt: "2026-05-17T08:00:00Z",
    deckSet: { id: "set-fromfile01", name: "Imported Set" },
    decks: [
      {
        id: "deck-fromfile01",
        name: "Imported Deck",
        cards: [{ id: "card-fromfile01", front: "f", back: "b", tags: ["t"] }],
      },
    ],
    ...overrides,
  };
  return stringifySharedDeckSet(file);
}

describe("SharedDeckSetImportPage", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("renders an error when the picked file is missing `formatVersion`", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-set-file-input")) as HTMLInputElement;
    const bad = makeFile(
      "nope.json",
      JSON.stringify({ format: SHARED_DECK_SET_FORMAT, deckSet: {}, decks: [] }),
    );

    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } });
    });

    const alert = await screen.findByTestId("shared-deck-set-import-error");
    expect(alert.textContent).toMatch(/formatVersion/);
  });

  it("renders an error when JSON is malformed", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-set-file-input")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("x.json", "{ broken")] } });
    });

    const alert = await screen.findByTestId("shared-deck-set-import-error");
    expect(alert.textContent).toMatch(/JSON/);
  });

  it("rejects cards larger than 5 MB and lists them in the error message", async () => {
    const oversized = "A".repeat(MAX_CARD_PAYLOAD_BYTES + 1);
    const json = makeSharedDeckSetJson({
      decks: [
        {
          id: "deck-fromfile01",
          name: "Big Deck",
          cards: [
            {
              id: "card-fromfile01",
              front: `![big](data:image/png;base64,${oversized})`,
              back: "",
              tags: [],
            },
          ],
        },
      ],
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-set-file-input")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("big.json", json)] } });
    });

    const alert = await screen.findByTestId("shared-deck-set-import-error");
    expect(alert.textContent).toMatch(/5-MB-Limit/);
    expect(alert.textContent).toMatch(/card-fromfile01/);
    // Nothing should have been written.
    expect(await db.deckSets.count()).toBe(0);
    expect(await db.decks.count()).toBe(0);
  });

  it("imports successfully and shows a summary panel", async () => {
    const json = makeSharedDeckSetJson();

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("shared-deck-set-file-input")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("ok.json", json)] } });
    });

    await waitFor(async () => {
      expect(await screen.findByTestId("shared-deck-set-import-success")).toBeInTheDocument();
    });

    expect((await db.deckSets.get("set-fromfile01"))?.name).toBe("Imported Set");
    expect((await db.decks.get("deck-fromfile01"))?.name).toBe("Imported Deck");
    expect(await db.cards.count()).toBe(1);
  });
});
