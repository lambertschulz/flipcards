// ADR-0014 — regression: the /deck/:deckId/card/new route was reachable
// via direct URL or browser back-nav during the 10s undo window after a
// deck-delete (and after the commit, before the page was unmounted). The
// page would then accept the create-form submit and insert an orphan
// Card pointing at a non-existent Deck — and once the deck-delete
// committed, the parent `deck:<id>` op left the pending set, so the
// orphan card surfaced in tag-session / due-card reads.
//
// The card-create-page now mirrors the deck-detail-page / card-edit-page
// pending guard: when `deck:<deckId>` is in the pending-delete window
// (or the parent has been removed entirely), the page redirects home.
// The submit handler additionally re-checks before writing.

import "fake-indexeddb/auto";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { CardCreatePage } from "@/features/card/card-create-page";
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

async function setupRouter(deckId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const createRouteDef = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/card/new",
    component: () => <CardCreatePage deckId={deckId} />,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div data-testid="deck-detail">deck-detail</div>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="home">home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, deckRoute, createRouteDef]),
    history: createMemoryHistory({
      initialEntries: [`/deck/${deckId}/card/new`],
    }),
  });
  await router.load();
  return router;
}

describe("CardCreatePage pending-delete guard (ADR-0014)", () => {
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

  it("redirects to home when the parent deck is in the pending-delete window", async () => {
    const deck = await createDeckInDb({ name: "Latein" });

    // Enqueue the pending-delete BEFORE rendering — simulates the user
    // hitting back-nav into the create URL after a deck-delete was queued.
    act(() => {
      getPendingDeletes().enqueue({
        key: `deck:${deck.id}`,
        label: "Deck gelöscht",
        commit: async () => {},
        restore: async () => {},
      });
    });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    // The redirect effect lands us on the home stub.
    await waitFor(() => expect(screen.queryByTestId("home")).not.toBeNull());
  });

  it("redirects to home when the parent deck no longer exists", async () => {
    // Direct URL to a deck that was already physically removed (the
    // commit fired before the user navigated). `useVisibleDeck` returns
    // `undefined` in this case too — the page must redirect, not render
    // an editor against a non-existent parent.
    const router = await setupRouter("ghost-deck-id");
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(screen.queryByTestId("home")).not.toBeNull());
  });
});
