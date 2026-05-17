import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckSetInDb } from "@/db/deck-sets";
import { createDeckInDb } from "@/db/decks";
import { putReviewState } from "@/db/review-states";
import { HomePage } from "@/features/home/home-page";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomePage,
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
  const tagSessionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session",
    component: () => <div>Tag-Session</div>,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>Settings</div>,
  });
  const backupImportRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/backup/import",
    component: () => <div>Backup-Import</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      deckRoute,
      deckNewRoute,
      deckSetRoute,
      deckSetNewRoute,
      tagSessionRoute,
      settingsRoute,
      backupImportRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return router;
}

describe("HomePage", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.deckSets.clear();
    await db.reviewStates.clear();
  });

  it("shows the empty state with three CTAs when there are no decks or deck-sets", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Eigenes Deck erstellen")).toBeInTheDocument();
    });
    expect(screen.getByText("Curated Deck wählen")).toBeInTheDocument();
    expect(screen.getByText("Backup importieren")).toBeInTheDocument();
    // No tour / onboarding overlay (ADR-0009).
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a deck with due-count badge and total card count", async () => {
    const deck = await createDeckInDb({ name: "Vokabeln" });
    await createCardInDb({ deckId: deck.id, front: "f1", back: "b1" });
    const c2 = await createCardInDb({ deckId: deck.id, front: "f2", back: "b2" });
    // c2 scheduled in the future → not due. c1 unseen → due.
    await putReviewState(c2.id, {
      repetitions: 1,
      easeFactor: 2.5,
      intervalDays: 5,
      nextDue: Date.now() + 5 * 24 * 60 * 60 * 1000,
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Vokabeln")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("1 fällig")).toBeInTheDocument();
    expect(screen.getByText("von 2")).toBeInTheDocument();
    expect(screen.getByTestId("home-summary").textContent).toMatch(/1 Card fällig in 1 Deck/);
  });

  it("groups decks under their deck-set and treats orphan deckSetIds as lose", async () => {
    const set = await createDeckSetInDb({ name: "Sprachen" });
    await createDeckInDb({ name: "Französisch", deckSetId: set.id });
    await createDeckInDb({ name: "Orphan", deckSetId: "missing-set-id" });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Sprachen")).toBeInTheDocument();
    });
    expect(screen.getByText("Französisch")).toBeInTheDocument();
    expect(screen.getByText("Lose Decks")).toBeInTheDocument();
    expect(screen.getByText("Orphan")).toBeInTheDocument();
  });

  it("collapses a deck-set group when the toggle is clicked", async () => {
    const set = await createDeckSetInDb({ name: "Sprachen" });
    await createDeckInDb({ name: "Französisch", deckSetId: set.id });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Französisch")).toBeInTheDocument();
    });
    const toggle = screen.getByRole("button", { name: "Sprachen einklappen" });
    fireEvent.click(toggle);
    expect(screen.queryByText("Französisch")).toBeNull();
  });

  it("renders the deck-set name as a Link to the deck-set detail page (non-empty set)", async () => {
    // Regression: a non-empty deck-set group must still expose a navigable
    // Link to /deck-set/$deckSetId via the set name itself, not only via the
    // empty-set "Decks hinzufügen" affordance. The collapse caret is a
    // sibling button — never nested inside the link.
    const set = await createDeckSetInDb({ name: "Sprachen" });
    await createDeckInDb({ name: "Französisch", deckSetId: set.id });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Französisch")).toBeInTheDocument();
    });
    const setLink = screen.getByRole("link", { name: "Sprachen" });
    expect(setLink).toBeInTheDocument();
    expect(setLink.getAttribute("href")).toBe(`/deck-set/${set.id}`);
  });

  it("refreshes due counts when wall-clock time crosses a nextDue boundary without any DB write", async () => {
    // Drive the test entirely on real timers — we manipulate `Date.now()`
    // directly (so the read-model sees the new wall clock) and dispatch
    // `visibilitychange` to force `useNow` to refresh immediately. This
    // exercises the same code path as the 60 s interval without faking
    // setInterval (which would deadlock Dexie's async I/O in jsdom).
    const baseTime = new Date("2030-01-01T08:00:00Z").getTime();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

    const deck = await createDeckInDb({ name: "Vokabeln" });
    const card = await createCardInDb({ deckId: deck.id, front: "f1", back: "b1" });
    await putReviewState(card.id, {
      repetitions: 1,
      easeFactor: 2.5,
      intervalDays: 0,
      nextDue: baseTime + 2 * 60_000, // due 2 minutes after baseline
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Vokabeln")).toBeInTheDocument();
    });
    // Initial state at baseTime: card is NOT yet due.
    expect(screen.getByLabelText("0 fällig")).toBeInTheDocument();
    expect(screen.getByTestId("home-summary").textContent).toMatch(/Heute keine Cards fällig/);

    // Advance only the wall clock — no DB write. Then fire the visibility
    // event that `useNow` reacts to, which forces an immediate
    // `setNow(Date.now())` and re-runs the read-model.
    nowSpy.mockReturnValue(baseTime + 3 * 60_000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(screen.getByLabelText("1 fällig")).toBeInTheDocument();
    });
    expect(screen.getByTestId("home-summary").textContent).toMatch(/1 Card fällig in 1 Deck/);

    nowSpy.mockRestore();
  });

  it("opens the + Neu menu and exposes both create actions", async () => {
    // One deck so we're not in empty state — `+ Neu` is visible in both states
    // but checking with real data avoids confusion with the empty-state CTAs.
    await createDeckInDb({ name: "Vokabeln" });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Vokabeln")).toBeInTheDocument();
    });
    const newButton = screen.getByRole("button", {
      name: "Neues Deck oder Deck-Set anlegen",
    });
    fireEvent.click(newButton);
    expect(screen.getByRole("menuitem", { name: "Neues Deck" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Neues Deck-Set" })).toBeInTheDocument();
  });
});
