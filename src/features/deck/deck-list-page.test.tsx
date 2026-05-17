import "fake-indexeddb/auto";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { DeckListPage } from "@/features/deck/deck-list-page";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: DeckListPage,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div>Deck</div>,
  });
  const deckNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/new",
    component: () => <div>New Deck</div>,
  });
  const deckSetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/$deckSetId",
    component: () => <div>DeckSet</div>,
  });
  const deckSetNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/new",
    component: () => <div>New DeckSet</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      deckRoute,
      deckNewRoute,
      deckSetRoute,
      deckSetNewRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return router;
}

describe("DeckListPage — orphan deckSetId", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.decks.clear();
    await db.deckSets.clear();
  });

  it("renders a deck whose deckSetId references a missing set under Lose Decks", async () => {
    // Deck with a stale deckSetId — no matching row in deckSets table.
    await createDeckInDb({ name: "Orphan Deck", deckSetId: "missing-set-id" });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Orphan Deck")).toBeInTheDocument();
    });
    expect(screen.getByText("Lose Decks")).toBeInTheDocument();
  });
});
