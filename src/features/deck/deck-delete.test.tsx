import "fake-indexeddb/auto";
import { PendingDeleteToasts } from "@/components/pending-delete-toasts";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { DeckDetailPage } from "@/features/deck/deck-detail-page";
import { DeckSettingsPage } from "@/features/deck/deck-settings-page";
import { __resetPendingDeletesForTests, getPendingDeletes } from "@/lib/pending-deletes";
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

async function setupCardDeleteRouter(deckId: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <PendingDeleteToasts />
      </>
    ),
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <DeckDetailPage deckId={deckId} />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  // Stubs for routes the DeckDetailPage links to (Lernen, Edit, …).
  const cardNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/card/new",
    component: () => <div>new card</div>,
  });
  const cardEditRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/card/$cardId/edit",
    component: () => <div>edit card</div>,
  });
  const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/review",
    component: () => <div>review</div>,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/settings",
    component: () => <div>settings</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      deckRoute,
      cardNewRoute,
      cardEditRoute,
      reviewRoute,
      settingsRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [`/deck/${deckId}`] }),
  });
  await router.load();
  return router;
}

describe("Card delete via deck-detail-page (ADR-0014)", () => {
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

  it("optimistically hides the card and shows an Undo toast (no confirmation modal)", async () => {
    const deck = await createDeckInDb({ name: "Latein" });
    await createCardInDb({ deckId: deck.id, front: "Card-One", back: "x" });

    const router = await setupCardDeleteRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByText("Card-One");
    fireEvent.click(screen.getByRole("button", { name: "Card löschen" }));

    // Optimistic hide — the row disappears immediately.
    await waitFor(() => expect(screen.queryByText("Card-One")).toBeNull());
    // Toast appears.
    await screen.findByText(/Card gelöscht/);
    // No modal was shown — confirm by searching for the cancel/confirm
    // labels that the modal would have rendered.
    expect(screen.queryByText("Endgültig löschen")).toBeNull();
    expect(screen.queryByText("Abbrechen")).toBeNull();
  });

  it("Undo restores the card from optimistic-hide and never commits", async () => {
    const deck = await createDeckInDb({ name: "Latein" });
    const card = await createCardInDb({ deckId: deck.id, front: "Card-Two", back: "x" });

    const router = await setupCardDeleteRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByText("Card-Two");
    fireEvent.click(screen.getByRole("button", { name: "Card löschen" }));
    await waitFor(() => expect(screen.queryByText("Card-Two")).toBeNull());

    fireEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));

    await waitFor(() => expect(screen.queryByText("Card-Two")).not.toBeNull());
    // IndexedDB row was never deleted — confirm by reading directly.
    expect(await db.cards.get(card.id)).toBeDefined();
  });

  it("flushAll commits the pending delete and removes the row from IndexedDB", async () => {
    const deck = await createDeckInDb({ name: "Latein" });
    const card = await createCardInDb({ deckId: deck.id, front: "Card-Three", back: "x" });

    const router = await setupCardDeleteRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByText("Card-Three");
    fireEvent.click(screen.getByRole("button", { name: "Card löschen" }));
    await waitFor(() => expect(screen.queryByText("Card-Three")).toBeNull());

    // Force the commit (proxy for the 10s timeout expiring or visibility=hidden).
    await act(async () => {
      await getPendingDeletes().flushAll();
    });

    expect(await db.cards.get(card.id)).toBeUndefined();
  });

  it("two rapid deletes stack as two independent toasts", async () => {
    const deck = await createDeckInDb({ name: "Latein" });
    await createCardInDb({ deckId: deck.id, front: "Card-A", back: "x" });
    await createCardInDb({ deckId: deck.id, front: "Card-B", back: "y" });

    const router = await setupCardDeleteRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByText("Card-A");
    await screen.findByText("Card-B");

    const buttons = screen.getAllByRole("button", { name: "Card löschen" });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    await waitFor(() => expect(screen.queryByText("Card-A")).toBeNull());
    await waitFor(() => expect(screen.queryByText("Card-B")).toBeNull());

    // Two toast lines visible → two Rückgängig buttons.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Rückgängig" })).toHaveLength(2),
    );
  });
});

// --- Deck delete via settings page -------------------------------------------

async function setupDeckSettingsRouter(deckId: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <PendingDeleteToasts />
      </>
    ),
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/settings",
    component: () => <DeckSettingsPage deckId={deckId} />,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div>Deck detail</div>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="home">Home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: [`/deck/${deckId}/settings`] }),
  });
  await router.load();
  return router;
}

describe("Deck delete via deck-settings-page (ADR-0014)", () => {
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

  it("shows a modal with the cascade card-count before enqueueing the delete", async () => {
    const deck = await createDeckInDb({ name: "Anatomie" });
    await createCardInDb({ deckId: deck.id, front: "a", back: "b" });
    await createCardInDb({ deckId: deck.id, front: "c", back: "d" });

    const router = await setupDeckSettingsRouter(deck.id);
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deck löschen" }));

    // Modal copy includes the deck name and the card-count cascade.
    const dialog = await screen.findByRole("dialog", { name: "Deck löschen?" });
    expect(dialog).toHaveTextContent('„Anatomie"');
    expect(dialog).toHaveTextContent("2");
    expect(dialog).toHaveTextContent("Cards");
  });

  it("Confirm enqueues the delete and navigates back to the deck list", async () => {
    const deck = await createDeckInDb({ name: "Anatomie" });
    const card = await createCardInDb({ deckId: deck.id, front: "a", back: "b" });

    const router = await setupDeckSettingsRouter(deck.id);
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deck löschen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Endgültig löschen" }));

    // Navigated back to "/" (the deck list stub).
    await screen.findByTestId("home");
    // Toast visible.
    await screen.findByText(/Deck.*gelöscht/);
    // IndexedDB unchanged until commit fires.
    expect(await db.decks.get(deck.id)).toBeDefined();
    expect(await db.cards.get(card.id)).toBeDefined();

    // Force commit → both deck and card vanish.
    await act(async () => {
      await getPendingDeletes().flushAll();
    });
    expect(await db.decks.get(deck.id)).toBeUndefined();
    expect(await db.cards.get(card.id)).toBeUndefined();
  });

  it("Cancel closes the modal and does NOT enqueue a delete", async () => {
    const deck = await createDeckInDb({ name: "Anatomie" });

    const router = await setupDeckSettingsRouter(deck.id);
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deck löschen" }));
    const dialog = await screen.findByRole("dialog", { name: "Deck löschen?" });
    // Use a within() scope to disambiguate from the DeckForm "Abbrechen".
    const cancelBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Abbrechen",
    );
    if (!cancelBtn) throw new Error("cancel button not found in modal");
    fireEvent.click(cancelBtn);

    // No toast was rendered for this deck → no pending op.
    expect(getPendingDeletes().list()).toHaveLength(0);
  });
});
