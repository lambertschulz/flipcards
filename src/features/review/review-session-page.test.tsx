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
    await clickAndFlush(await screen.findByRole("button", { name: /Open-ended/i }));

    for (let i = 0; i < 5; i++) {
      const face = await screen.findByRole("button", { name: /Vorderseite/i });
      await clickAndFlush(face);
      const goodBtn = await screen.findByRole("button", { name: "Gut" });
      await clickAndFlush(goodBtn);
    }

    await screen.findByRole("heading", { name: /Session beendet/i });
    expect(screen.getByTestId("review-session-summary")).toHaveTextContent("5 Cards beantwortet");
    expect(screen.getByTestId("review-session-summary")).toHaveTextContent("Gut: 5");
    expect(screen.getByTestId("review-session-streak")).toHaveTextContent("1 Tag");

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
    await clickAndFlush(await screen.findByRole("button", { name: /Open-ended/i }));

    // 2 due cards + 1 Again requeue = 3 answers before the summary.
    for (let step = 0; step < 3; step++) {
      const face = await screen.findByRole("button", { name: /Vorderseite/i });
      await clickAndFlush(face);
      const rating = step === 0 ? "Wieder" : "Gut";
      const btn = await screen.findByRole("button", { name: rating });
      await clickAndFlush(btn);
    }

    await screen.findByRole("heading", { name: /Session beendet/i });
    expect(await db.reviews.count()).toBe(3);
  });

  it("shows grading labels without interval or shortcut prefixes while keeping keyboard shortcuts", async () => {
    const deck = await createDeckInDb({ name: "Labels-Deck" });
    await createCardInDb({ deckId: deck.id, front: "Front", back: "Back" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByRole("button", { name: /Open-ended/i }));
    await clickAndFlush(await screen.findByRole("button", { name: /Vorderseite/i }));

    expect(screen.getByRole("button", { name: "Wieder" })).toHaveAttribute(
      "aria-keyshortcuts",
      "1",
    );
    expect(screen.getByRole("button", { name: "Schwer" })).toHaveAttribute(
      "aria-keyshortcuts",
      "2",
    );
    expect(screen.getByRole("button", { name: "Gut" })).toHaveAttribute("aria-keyshortcuts", "3");
    expect(screen.getByRole("button", { name: "Leicht" })).toHaveAttribute(
      "aria-keyshortcuts",
      "4",
    );
    expect(screen.queryByRole("button", { name: /1 Again/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/min|Tag(e)?|Tage|day|days/i)).not.toBeInTheDocument();
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
