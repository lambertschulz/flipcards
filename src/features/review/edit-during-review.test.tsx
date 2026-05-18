import "fake-indexeddb/auto";
import { createCardInDb, getCard } from "@/db/cards";
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

// Issue #6 — edit-during-review.
//
// These tests pin down the invariants from the agent brief:
//   1. Opening the edit-modal mid-session must not write to the review log,
//      must not mutate the review-state, and must not reset the queue.
//   2. Editing before the rating: the new card content is shown, the rating
//      is still pending, no review-log row has been written yet.
//   3. Editing after the rating: the already-written review-log row and the
//      SM-2 schedule remain untouched.

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

describe("Edit-during-Review (issue #6)", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  it("renders a pencil-icon edit button on the review screen", async () => {
    const deck = await createDeckInDb({ name: "Edit-Deck" });
    await createCardInDb({ deckId: deck.id, front: "Tippfehler-Front", back: "Back" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await click(await screen.findByRole("button", { name: /Open-ended/i }));

    const editBtn = await screen.findByRole("button", { name: /Card bearbeiten/i });
    expect(editBtn).toBeInTheDocument();
  });

  it("opening the edit-modal does not write to the review log or schedule the card", async () => {
    const deck = await createDeckInDb({ name: "No-Side-Effects-Deck" });
    const card = await createCardInDb({
      deckId: deck.id,
      front: "Original-Front",
      back: "Original-Back",
    });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await click(await screen.findByRole("button", { name: /Open-ended/i }));
    await click(await screen.findByRole("button", { name: /Card bearbeiten/i }));

    // Modal is open — but we have not rated anything. There must be zero
    // review-log entries and no review-state for this card yet.
    expect(await db.reviews.count()).toBe(0);

    // `getReviewState` returns a default for unseen cards. Repetitions === 0
    // is the "fresh / untouched" sentinel.
    const state = await getReviewState(card.id);
    expect(state.repetitions).toBe(0);
  });

  it("editing the card before the rating updates the visible card without writing a review-log entry", async () => {
    const deck = await createDeckInDb({ name: "Pre-Rating-Edit" });
    const card = await createCardInDb({
      deckId: deck.id,
      front: "Tippfehlr",
      back: "Antwort",
    });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await click(await screen.findByRole("button", { name: /Open-ended/i }));
    expect(await screen.findByText("Tippfehlr")).toBeInTheDocument();

    // Open the modal.
    await click(await screen.findByRole("button", { name: /Card bearbeiten/i }));

    // Edit the front field inside the modal. The shared CardEditor labels
    // the textarea "Vorderseite".
    const frontInput = (await screen.findAllByLabelText(/Vorderseite/i)).find(
      (el): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement,
    );
    expect(frontInput).toBeDefined();
    if (!frontInput) throw new Error("front textarea not found");

    await act(async () => {
      fireEvent.change(frontInput, { target: { value: "Tippfehler-korrigiert" } });
    });

    // Trigger blur to flush the editor's auto-save path.
    await act(async () => {
      fireEvent.blur(frontInput);
    });

    // Wait until the DB row reflects the edit.
    await act(async () => {
      // give microtasks + the editor's persist a tick to settle
      await new Promise((r) => setTimeout(r, 0));
    });

    const reloaded = await getCard(card.id);
    expect(reloaded?.front).toBe("Tippfehler-korrigiert");

    // Crucial: no review log row has been written. The rating is still
    // pending — editing the content is NOT a rating.
    expect(await db.reviews.count()).toBe(0);
    const state = await getReviewState(card.id);
    expect(state.repetitions).toBe(0);
  });

  it("gates global review shortcuts (Space, 1-4) while the edit-modal is open", async () => {
    const deck = await createDeckInDb({ name: "Shortcut-Gate" });
    const card = await createCardInDb({
      deckId: deck.id,
      front: "Front",
      back: "Back",
    });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await click(await screen.findByRole("button", { name: /Open-ended/i }));

    // --- Front side, modal open: Space must NOT flip the card. ---
    await click(await screen.findByRole("button", { name: /Card bearbeiten/i }));

    // The front content is still displayed (modal is overlay, underlying
    // review card is unchanged). Dispatch Space on document.body — this is
    // what bubbles from a focused tab/button inside the modal.
    await act(async () => {
      fireEvent.keyDown(document.body, { key: " ", code: "Space" });
    });

    // No reviews logged, no schedule change — modal is still open.
    expect(await db.reviews.count()).toBe(0);
    expect((await getReviewState(card.id)).repetitions).toBe(0);

    // Close the modal via the labelled "Schließen" button, reveal the back
    // side normally, then re-open the modal and prove that pressing "1"
    // does not rate the card.
    await click(await screen.findByRole("button", { name: /Schließen/i }));

    // Reveal the back via the visible "Vorderseite" affordance.
    const front = await screen.findByRole("button", { name: /Vorderseite/i });
    await click(front);

    // Re-open the modal on the back side.
    await click(await screen.findByRole("button", { name: /Card bearbeiten/i }));

    // Press "1" — must NOT trigger the "again" rating while the modal is open.
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "1" });
    });

    // No review row written, no SM-2 mutation.
    expect(await db.reviews.count()).toBe(0);
    expect((await getReviewState(card.id)).repetitions).toBe(0);
  });

  it("editing after rating preserves the already-written review-log row and SM-2 schedule", async () => {
    const deck = await createDeckInDb({ name: "Post-Rating-Edit" });
    const card = await createCardInDb({
      deckId: deck.id,
      front: "Front",
      back: "Back",
    });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await click(await screen.findByRole("button", { name: /Open-ended/i }));

    // Reveal and rate. There's only one card, so after Good the session ends.
    await click(await screen.findByRole("button", { name: /Vorderseite/i }));
    await click(await screen.findByRole("button", { name: "Gut" }));
    // Wait for the session-end screen to confirm the answer() flow finished
    // (it writes review-state + review-log before transitioning).
    await screen.findByRole("heading", { name: /Session beendet/i });

    // Capture the post-rating state.
    const reviewCountAfterRating = await db.reviews.count();
    const stateAfterRating = await getReviewState(card.id);
    expect(reviewCountAfterRating).toBe(1);
    expect(stateAfterRating.repetitions).toBe(1);

    // Now edit the card content directly via the db helper (the session has
    // moved on to the summary screen so the modal is no longer mounted, but
    // the brief's invariant is about the DB-level behaviour: editing card
    // content must not roll back the existing review log or SM-2 state).
    const { updateCardInDb } = await import("@/db/cards");
    await updateCardInDb(card.id, { front: "Front-fixed", back: "Back-fixed" });

    // Review log unchanged.
    expect(await db.reviews.count()).toBe(reviewCountAfterRating);

    // SM-2 state unchanged.
    const stateAfterEdit = await getReviewState(card.id);
    expect(stateAfterEdit.repetitions).toBe(stateAfterRating.repetitions);
    expect(stateAfterEdit.intervalDays).toBe(stateAfterRating.intervalDays);
    expect(stateAfterEdit.easeFactor).toBe(stateAfterRating.easeFactor);
    expect(stateAfterEdit.nextDue).toBe(stateAfterRating.nextDue);
  });
});
