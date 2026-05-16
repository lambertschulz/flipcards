import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { getReviewState } from "@/db/review-states";
import { ReviewSessionPage } from "@/features/review/review-session-page";
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

async function setupRouter(deckId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/review",
    component: () => <ReviewSessionPage deckId={deckId} />,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div>Deck page</div>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, deckRoute, reviewRoute]),
    history: createMemoryHistory({ initialEntries: [`/deck/${deckId}/review`] }),
  });
  await router.load();
  return router;
}

describe("ReviewSessionPage — full session smoke test", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  async function clickAndFlush(el: HTMLElement) {
    await act(async () => {
      fireEvent.click(el);
    });
  }

  it("walks five cards from start to summary, writing review-state and review-log", async () => {
    const deck = await createDeckInDb({ name: "Test-Deck" });
    const cardIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await createCardInDb({
        deckId: deck.id,
        front: `Front ${i}`,
        back: `Back ${i}`,
      });
      cardIds.push(c.id);
    }

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { name: /Lernen — Test-Deck/i });
    await clickAndFlush(screen.getByRole("button", { name: /Open-ended/i }));

    for (let i = 0; i < 5; i++) {
      const face = await screen.findByRole("button", { name: /Vorderseite/i });
      await clickAndFlush(face);
      const goodBtn = await screen.findByRole("button", { name: /3 Good/i });
      await clickAndFlush(goodBtn);
    }

    await screen.findByRole("heading", { name: /Session beendet/i });

    expect(await db.reviews.count()).toBe(5);
    for (const id of cardIds) {
      const state = await getReviewState(id);
      expect(state.repetitions).toBe(1);
      expect(state.intervalDays).toBe(1);
      expect(state.nextDue).toBeGreaterThan(0);
    }
  });

  it("requeues an Again-rated card so the user sees it twice in one session", async () => {
    const deck = await createDeckInDb({ name: "Again-Deck" });
    await createCardInDb({ deckId: deck.id, front: "F1", back: "B1" });
    await createCardInDb({ deckId: deck.id, front: "F2", back: "B2" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { name: /Lernen — Again-Deck/i });
    await clickAndFlush(screen.getByRole("button", { name: /Open-ended/i }));

    // 2 due cards + 1 Again requeue = 3 answers before the summary.
    for (let step = 0; step < 3; step++) {
      const face = await screen.findByRole("button", { name: /Vorderseite/i });
      await clickAndFlush(face);
      const rating = step === 0 ? /1 Again/i : /3 Good/i;
      const btn = await screen.findByRole("button", { name: rating });
      await clickAndFlush(btn);
    }

    await screen.findByRole("heading", { name: /Session beendet/i });
    expect(await db.reviews.count()).toBe(3);
  });

  it("shows the empty-state when the deck has no cards", async () => {
    const deck = await createDeckInDb({ name: "Empty-Deck" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByRole("button", { name: /Open-ended/i }));

    await waitFor(() => {
      expect(screen.getByText(/Keine Cards fällig/i)).toBeInTheDocument();
    });
  });
});
