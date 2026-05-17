import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { putReviewState } from "@/db/review-states";
import { INITIAL_REVIEW_STATE } from "@/domain/sm2";
import { DeckDetailPage } from "@/features/deck/deck-detail-page";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;

async function setupRouter(deckId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: function DetailRouteComponent() {
      const { deckId: id } = detailRoute.useParams();
      // Mirror the production route (src/app/routes.tsx): key by deckId
      // so navigating between two decks remounts the page and resets
      // the page-local filter state.
      return <DeckDetailPage key={id} deckId={id} />;
    },
  });
  const cardEditRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/card/$cardId/edit",
    component: () => <div>edit</div>,
  });
  const cardNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/card/new",
    component: () => <div>new card</div>,
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
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      detailRoute,
      cardEditRoute,
      cardNewRoute,
      reviewRoute,
      settingsRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [`/deck/${deckId}`] }),
  });
  await router.load();
  return router;
}

async function typeInto(el: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(el, { target: { value } });
  });
}

async function clickAndFlush(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

function cardListItems(): HTMLElement[] {
  // The visible list lives in a `ul`; locate it and return its `li`s.
  // We avoid `getAllByRole('listitem')` because tag chips also render as `li`.
  const lists = screen.getAllByRole("list");
  const cardList = lists.find((l) => {
    const firstItem = l.querySelector("li");
    if (!firstItem) return false;
    // Card-list `li`s have the delete-button affordance; tag-chip `li`s don't.
    return !!firstItem.querySelector('button[aria-label="Card löschen"]');
  });
  if (!cardList) return [];
  return Array.from(cardList.querySelectorAll("li"));
}

describe("DeckDetailPage filter bar (issue #10)", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.deckSets.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  it("does not render the filter bar when the deck has no cards", async () => {
    const deck = await createDeckInDb({ name: "Empty" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByText(/Noch keine Cards angelegt/i);
    expect(screen.queryByLabelText(/Cards durchsuchen/i)).not.toBeInTheDocument();
  });

  it("renders the search input and a tag chip per distinct tag", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "Bonjour", back: "Hi", tags: ["fr"] });
    await createCardInDb({ deckId: deck.id, front: "Hallo", back: "Hello", tags: ["de", "en"] });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await screen.findByLabelText(/Cards durchsuchen/i);
    expect(screen.getByRole("button", { name: "fr 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "de 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "en 1" })).toBeInTheDocument();
  });

  it("filters cards by case-insensitive substring on front/back", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "Frosch", back: "Frog" });
    await createCardInDb({ deckId: deck.id, front: "Apfel", back: "Apple" });
    await createCardInDb({ deckId: deck.id, front: "Hund", back: "Dog" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText(/Cards durchsuchen/i);
    await typeInto(input, "FROG");

    await waitFor(() => {
      const items = cardListItems();
      expect(items).toHaveLength(1);
      expect(within(items[0]).getByText(/Frosch/)).toBeInTheDocument();
    });
  });

  it("AND-combines multiple selected tag chips", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "c1", back: "x", tags: ["a", "b"] });
    await createCardInDb({ deckId: deck.id, front: "c2", back: "x", tags: ["a"] });
    await createCardInDb({ deckId: deck.id, front: "c3", back: "x", tags: ["b"] });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    // Tag-chip counts reflect the search+status prefilter only — they don't
    // shrink as other tags get selected (that would make it hard to ever
    // *re-enable* a previously-clicked combination). Both chips start at 2.
    // Use exact accessible names (incl. count) to disambiguate from the
    // status buttons ("Alle"/"Nur Due") which share leading letters.
    await clickAndFlush(await screen.findByRole("button", { name: "a 2" }));
    await clickAndFlush(await screen.findByRole("button", { name: "b 2" }));

    await waitFor(() => {
      const items = cardListItems();
      expect(items).toHaveLength(1);
      expect(within(items[0]).getByText("c1")).toBeInTheDocument();
    });
  });

  it("status='Nur Due' hides cards whose Review-State puts them in the future", async () => {
    const deck = await createDeckInDb({ name: "D" });
    const c1 = await createCardInDb({ deckId: deck.id, front: "DueOne", back: "x" });
    const c2 = await createCardInDb({ deckId: deck.id, front: "Future", back: "x" });
    // c1: no review-state → due (first-seen)
    // c2: scheduled for tomorrow → not due
    await putReviewState(c2.id, { ...INITIAL_REVIEW_STATE, nextDue: Date.now() + DAY_MS });
    expect(c1.id).toBeTruthy();

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByRole("button", { name: /Nur Due/i }));

    await waitFor(() => {
      const items = cardListItems();
      expect(items).toHaveLength(1);
      expect(within(items[0]).getByText("DueOne")).toBeInTheDocument();
    });
  });

  it("shows the empty-results state with a reset button when filters match nothing", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "Bonjour", back: "Hi" });

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText(/Cards durchsuchen/i);
    await typeInto(input, "zzz-nothing");

    const resetBtn = await screen.findByRole("button", { name: /Filter zurücksetzen/i });
    expect(screen.getByText(/Keine Cards passen/i)).toBeInTheDocument();

    await clickAndFlush(resetBtn);

    await waitFor(() => {
      const items = cardListItems();
      expect(items).toHaveLength(1);
    });
    expect((screen.getByLabelText(/Cards durchsuchen/i) as HTMLInputElement).value).toBe("");
  });

  it("resets the filter bar when navigating to a different deck", async () => {
    // Re-entering the deck-detail page must discard page-local filter
    // state — otherwise the previous deck's query/tags/status leak into
    // the new deck (see PR #43 review feedback for issue #10).
    const deckA = await createDeckInDb({ name: "A" });
    const deckB = await createDeckInDb({ name: "B" });
    await createCardInDb({ deckId: deckA.id, front: "Frosch", back: "Frog", tags: ["fr"] });
    await createCardInDb({ deckId: deckB.id, front: "Apfel", back: "Apple", tags: ["de"] });

    const router = await setupRouter(deckA.id);
    render(<RouterProvider router={router} />);

    // Activate a query filter on deck A.
    const inputA = (await screen.findByLabelText(/Cards durchsuchen/i)) as HTMLInputElement;
    await typeInto(inputA, "Frosch");
    // Activate a tag chip on deck A. After query="Frosch" the fr-chip count is 1.
    await clickAndFlush(await screen.findByRole("button", { name: "fr 1" }));
    // Activate a non-default status on deck A.
    await clickAndFlush(await screen.findByRole("button", { name: /Nur Due/i }));

    expect(inputA.value).toBe("Frosch");

    // Navigate to deck B (same route component, different param).
    await act(async () => {
      await router.navigate({ to: "/deck/$deckId", params: { deckId: deckB.id } });
    });

    // The filter bar for deck B must be reset to defaults.
    const inputB = (await screen.findByLabelText(/Cards durchsuchen/i)) as HTMLInputElement;
    await waitFor(() => {
      expect(inputB.value).toBe("");
    });
    // No tag chip pressed (the only chip rendered for deck B is "de 1").
    const deChip = screen.getByRole("button", { name: "de 1" });
    expect(deChip.getAttribute("aria-pressed")).toBe("false");
    // Status back to default ("Alle").
    const alleBtn = screen.getByRole("button", { name: /^Alle$/i });
    expect(alleBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("recomputes the Due-set as wall-clock time advances (no DB writes)", async () => {
    // Regression test for PR #43 review feedback: the dueCardIds memo used
    // to capture Date.now() only when cards/reviewStates changed, so a card
    // that became due while the page sat idle stayed hidden under "Nur Due".
    // With a ticking clock the memo invalidates on each tick and the card
    // appears on the next render.
    const DUE_IN_MS = 5 * 60 * 1000; // 5 minutes
    const TICK_INTERVAL_MS = 60_000; // matches NOW_TICK_MS in deck-detail-page

    // DB setup happens on real timers (fake-indexeddb relies on setTimeout).
    const baseTime = Date.now();
    const deck = await createDeckInDb({ name: "D" });
    const becomesDue = await createCardInDb({
      deckId: deck.id,
      front: "BecomesDue",
      back: "x",
    });
    // Schedule the card 5 minutes in the future (not currently due).
    await putReviewState(becomesDue.id, {
      ...INITIAL_REVIEW_STATE,
      nextDue: baseTime + DUE_IN_MS,
    });

    const router = await setupRouter(deck.id);

    // Switch to fake timers BEFORE mounting, so the page's setInterval is
    // registered against the fake clock. Only fake the timer pieces we
    // need — leaving queueMicrotask/Promise alone keeps React + Dexie
    // microtasks flushing normally.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(baseTime);

    try {
      render(<RouterProvider router={router} />);

      // Wait for the deck and its cards to load.
      await screen.findByLabelText(/Cards durchsuchen/i);

      // Activate "Nur Due" — card is in the future so it should be hidden.
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Nur Due/i }));
      });

      await waitFor(() => {
        // Empty-results state appears once the card is filtered out.
        expect(screen.getByText(/Keine Cards passen/i)).toBeInTheDocument();
      });

      // Advance the fake clock past nextDue without any DB writes. The
      // page's setInterval should fire, call setNow(Date.now()), and the
      // dueCardIds memo should recompute with the new "now".
      vi.setSystemTime(baseTime + DUE_IN_MS + TICK_INTERVAL_MS);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);
      });

      await waitFor(() => {
        const items = cardListItems();
        expect(items).toHaveLength(1);
        expect(within(items[0]).getByText("BecomesDue")).toBeInTheDocument();
      });
      // Unmount while fake timers are still installed so the page's
      // clearInterval cleanup matches the setInterval registered against
      // the fake clock.
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it("AND-combines query, tag, and status filters", async () => {
    const deck = await createDeckInDb({ name: "D" });
    const c1 = await createCardInDb({
      deckId: deck.id,
      front: "Bonjour",
      back: "Hi",
      tags: ["fr"],
    });
    await createCardInDb({ deckId: deck.id, front: "Bonsoir", back: "Eve", tags: ["fr"] });
    await createCardInDb({ deckId: deck.id, front: "Hallo", back: "Hi", tags: ["de"] });
    // Push c1's neighbour into the future to test the status filter.
    // Use the second French card's id.
    const all = await db.cards.where("deckId").equals(deck.id).toArray();
    const other = all.find((c) => c.id !== c1.id && c.front === "Bonsoir");
    expect(other).toBeTruthy();
    if (other) {
      await putReviewState(other.id, { ...INITIAL_REVIEW_STATE, nextDue: Date.now() + DAY_MS });
    }

    const router = await setupRouter(deck.id);
    render(<RouterProvider router={router} />);

    await typeInto(await screen.findByLabelText(/Cards durchsuchen/i), "bon");
    // After query "bon" the fr-chip count is 2 (both Bonjour and Bonsoir).
    await clickAndFlush(await screen.findByRole("button", { name: "fr 2" }));
    await clickAndFlush(await screen.findByRole("button", { name: /Nur Due/i }));

    await waitFor(() => {
      const items = cardListItems();
      expect(items).toHaveLength(1);
      expect(within(items[0]).getByText("Bonjour")).toBeInTheDocument();
    });
  });
});
