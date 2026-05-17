// ADR-0014 — regression: the /deck/:deckId/card/:cardId/edit route was
// reachable via direct URL or browser back-nav during the 10s undo window
// after a card-delete. The page would then render the editor for a card
// that has already been optimistically deleted (and will be physically
// removed when the commit timer fires). This violates the invariant that
// "no read-model anywhere in the app may surface a pending-deleted row".
//
// The card-edit-page now mirrors the deck-detail-page's pending guard:
// when `card:<id>` (or the parent `deck:<deckId>`) is in the pending-delete
// window, the page redirects back to the deck-detail-page.

import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { CardEditPage } from "@/features/card/card-edit-page";
import { __resetPendingDeletesForTests, getPendingDeletes } from "@/lib/pending-deletes";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function setupRouter(deckId: string, cardId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/card/$cardId/edit",
    component: () => <CardEditPage deckId={deckId} cardId={cardId} />,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div data-testid="deck-detail">deck-detail</div>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, deckRoute, editRoute]),
    history: createMemoryHistory({
      initialEntries: [`/deck/${deckId}/card/${cardId}/edit`],
    }),
  });
  await router.load();
  return router;
}

describe("CardEditPage pending-delete guard (ADR-0014)", () => {
  beforeEach(async () => {
    await db.open();
    __resetPendingDeletesForTests();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    __resetPendingDeletesForTests();
  });

  it("redirects to deck-detail when the card is in the pending-delete window", async () => {
    const deck = await createDeckInDb({ name: "Latein" });
    const card = await createCardInDb({ deckId: deck.id, front: "front", back: "back" });

    // Enqueue the pending-delete BEFORE rendering — simulates the user
    // hitting back-nav into the edit URL after a delete was queued.
    act(() => {
      getPendingDeletes().enqueue({
        key: `card:${card.id}`,
        label: "Card gelöscht",
        commit: async () => {},
        restore: async () => {},
      });
    });

    const router = await setupRouter(deck.id, card.id);
    render(<RouterProvider router={router} />);

    // The redirect effect lands us on the deck-detail stub.
    await waitFor(() => expect(screen.queryByTestId("deck-detail")).not.toBeNull());
  });

  it("redirects to deck-detail when the parent deck is in the pending-delete window", async () => {
    const deck = await createDeckInDb({ name: "Latein" });
    const card = await createCardInDb({ deckId: deck.id, front: "front", back: "back" });

    act(() => {
      getPendingDeletes().enqueue({
        key: `deck:${deck.id}`,
        cascadeKeys: [`card:${card.id}`],
        label: "Deck gelöscht",
        commit: async () => {},
        restore: async () => {},
      });
    });

    const router = await setupRouter(deck.id, card.id);
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(screen.queryByTestId("deck-detail")).not.toBeNull());
  });
});
