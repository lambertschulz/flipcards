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
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Issue #12 — accessibility target (ADR-0015).
//
// Pins down the Keyboard-Coverage acceptance criterion for the Review-Flow:
// a full round (start → flip → rate) must be drivable from the keyboard
// alone, using Space to flip and 1–4 to rate. This is the hard floor of
// ADR-0015 — if it ever regresses, this test fails before a release ships.

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

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

async function pressKey(init: { key: string; code?: string }) {
  await act(async () => {
    fireEvent.keyDown(document.body, init);
  });
}

describe("Review-Flow keyboard a11y (ADR-0015)", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  it("drives a full session via Space (flip) and 1–4 (rate) without touching the mouse on review screens", async () => {
    const deck = await createDeckInDb({ name: "Keyboard-Deck" });
    const cardIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await createCardInDb({
        deckId: deck.id,
        front: `F${i}`,
        back: `B${i}`,
      });
      cardIds.push(c.id);
    }

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    // The session-start screen is not keyboard-scoped — there's no
    // session-flow yet to map Space onto. We click "Open-ended" once to
    // enter the review queue; from there the rest is keyboard-only.
    await click(await screen.findByRole("button", { name: /Open-ended/i }));

    // 4 cards × (Space → number) — one Again, then Hard/Good/Easy. The Again
    // re-queues the first card, so we end up with five rating events total.
    const ratings = ["1", "2", "3", "4", "3"] as const;
    for (const key of ratings) {
      // Front side renders an interactive face; assert it's there before
      // pressing Space so we know the flip handler is in scope.
      await screen.findByRole("button", { name: /Vorderseite/i });
      await pressKey({ key: " ", code: "Space" });

      // Back side renders the rating fieldset (the "3 Good" button is the
      // simplest landmark to wait on). Pressing 1–4 must record the answer
      // and advance to the next card (or end the session).
      await screen.findByRole("button", { name: /3 Good/i });
      await pressKey({ key });
    }

    await screen.findByRole("heading", { name: /Session beendet/i });

    // All four cards' SM-2 schedules were updated, and we wrote five
    // review-log rows (four originals + one Again-requeue).
    expect(await db.reviews.count()).toBe(5);
    for (const id of cardIds) {
      const state = await getReviewState(id);
      expect(state.repetitions).toBeGreaterThanOrEqual(1);
    }
  });

  it("Space on the front face is intercepted via window-level keydown listener", async () => {
    // Regression guard: the runner attaches `keydown` to `window` (not to
    // the card element), so a Space press anywhere on the page must flip
    // the card. This is what makes the flow drivable from the keyboard
    // even when focus is not on the face.
    const deck = await createDeckInDb({ name: "Space-Deck" });
    await createCardInDb({ deckId: deck.id, front: "Front", back: "Back" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await click(await screen.findByRole("button", { name: /Open-ended/i }));

    // Front rendered.
    await screen.findByRole("button", { name: /Vorderseite/i });

    // Press Space without focusing the face — the listener is on `window`.
    await pressKey({ key: " ", code: "Space" });

    // Back side now exposes the rating buttons — flip succeeded.
    await screen.findByRole("button", { name: /3 Good/i });
  });
});
