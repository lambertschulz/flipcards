// ADR-0014 / Sharpened-Brief (issue #8) regression suite.
//
// Invariant under test: no read-model anywhere in the app may surface a row
// whose pending-delete op is in `pending` or `committing` state — neither the
// directly-deleted entity nor any cascade descendant.
//
// Prior review rounds kept finding new read-paths that leaked deleted rows:
//
//   - R1: in-flight commit could be "undone" without cancelling
//   - R2: deck-list / deck-detail filtered by `op.state === "pending"`
//         (let rows flash back during `committing`)
//   - R3: `listAllDueCards()` was not honoured by tag-session screens, so
//         a deck-delete left its child cards reachable during the 10s window
//
// This file pins the *centralised* fix: the coordinator now carries cascade
// keys per op, every read-path goes through `store.isPending(key)`, and a
// deck-delete enqueues `card:<id>` for each child card. The tests below
// exercise each enumerated read-path from the Sharpened Brief.

import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { putReviewState } from "@/db/review-states";
import { INITIAL_REVIEW_STATE } from "@/domain/sm2";
import { DeckDetailPage } from "@/features/deck/deck-detail-page";
import { ReviewSessionPage } from "@/features/review/review-session-page";
import { TagPickerPage } from "@/features/tag-session/tag-picker-page";
import { TagSessionReviewPage } from "@/features/tag-session/tag-session-review-page";
import {
  __resetPendingDeletesForTests,
  createPendingDeletesStore,
  getPendingDeletes,
} from "@/lib/pending-deletes";
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

// All cards seeded by these tests get a Due review-state at t=0 so they
// surface through `listDueCardsInDeck` / `listAllDueCards`.
const PAST = INITIAL_REVIEW_STATE; // nextDue: 0 → Due-now

async function seedDueCard(opts: { deckId: string; front: string; tags?: string[] }) {
  const c = await createCardInDb({
    deckId: opts.deckId,
    front: opts.front,
    back: "x",
    tags: opts.tags ?? [],
  });
  await putReviewState(c.id, PAST);
  return c;
}

// --- Coordinator-level test: cascade keys propagate through `isPending` ----

describe("PendingDeletesStore — cascade keys", () => {
  it("`isPending(cascadeKey)` returns true for every supplied cascade key", () => {
    const store = createPendingDeletesStore({
      // No scheduler firing — we just want to inspect `isPending` after enqueue.
      scheduler: {
        setTimeout: () => 0,
        clearTimeout: () => {},
      },
    });

    store.enqueue({
      key: "deck:d1",
      cascadeKeys: ["card:c1", "card:c2", "card:c3"],
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    expect(store.isPending("deck:d1")).toBe(true);
    expect(store.isPending("card:c1")).toBe(true);
    expect(store.isPending("card:c2")).toBe(true);
    expect(store.isPending("card:c3")).toBe(true);
    expect(store.isPending("card:other")).toBe(false);
  });

  it("`undo` removes all cascade-keys from `isPending` in the same publish tick", async () => {
    const store = createPendingDeletesStore({
      scheduler: { setTimeout: () => 0, clearTimeout: () => {} },
    });

    const id = store.enqueue({
      key: "deck:d1",
      cascadeKeys: ["card:c1", "card:c2"],
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });
    expect(store.isPending("card:c1")).toBe(true);

    await store.undo(id);
    expect(store.isPending("deck:d1")).toBe(false);
    expect(store.isPending("card:c1")).toBe(false);
    expect(store.isPending("card:c2")).toBe(false);
  });
});

// --- Read-path: DeckDetailPage filters cascaded card keys (deck-delete) ----

async function setupDeckDetailRouter(deckId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <DeckDetailPage deckId={deckId} />,
  });
  // Stub routes the DeckDetailPage links to.
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/settings",
    component: () => <div>settings</div>,
  });
  const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/review",
    component: () => <div>review</div>,
  });
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
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      deckRoute,
      settingsRoute,
      reviewRoute,
      cardNewRoute,
      cardEditRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [`/deck/${deckId}`] }),
  });
  await router.load();
  return router;
}

describe("Cascade-key invariant — DeckDetailPage", () => {
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

  it("hides child cards when the parent deck has a pending-delete op with cascade keys", async () => {
    const deck = await createDeckInDb({ name: "Anatomie" });
    const c1 = await createCardInDb({ deckId: deck.id, front: "Card-One", back: "x" });
    const c2 = await createCardInDb({ deckId: deck.id, front: "Card-Two", back: "x" });

    const store = getPendingDeletes();
    store.enqueue({
      key: `deck:${deck.id}`,
      cascadeKeys: [`card:${c1.id}`, `card:${c2.id}`],
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    const router = await setupDeckDetailRouter(deck.id);
    render(<RouterProvider router={router} />);

    // Both cards are pending-deleted via the deck-level cascade keys.
    await waitFor(() => expect(screen.queryByText("Card-One")).toBeNull());
    expect(screen.queryByText("Card-Two")).toBeNull();
  });
});

// --- Read-path: TagPickerPage drops cascaded cards from baseline counts ----

async function setupTagPickerRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const pickerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session",
    component: TagPickerPage,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pickerRoute]),
    history: createMemoryHistory({ initialEntries: ["/tag-session"] }),
  });
  await router.load();
  return router;
}

describe("Cascade-key invariant — TagPickerPage", () => {
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

  it("excludes cascade-deleted cards from chip baseline counts during the undo window", async () => {
    const deck = await createDeckInDb({ name: "Deck" });
    // Two due cards tagged with the same tag. We'll mark one (and only one)
    // as pending-deleted via a deck-level cascade key; the baseline count
    // for the tag must drop to 1.
    const c1 = await seedDueCard({ deckId: deck.id, front: "C1", tags: ["alpha"] });
    await seedDueCard({ deckId: deck.id, front: "C2", tags: ["alpha"] });

    // Enqueue a deck-delete op carrying ONLY c1 as a cascade key — a
    // contrived setup that lets us assert the picker honours the per-key
    // cascade list rather than just the primary deck key (which would have
    // hidden every card under the deck anyway).
    const store = getPendingDeletes();
    store.enqueue({
      key: "deck:unrelated", // not the actual deck — primary key irrelevant for this assertion
      cascadeKeys: [`card:${c1.id}`],
      label: "x",
      commit: async () => {},
      restore: async () => {},
    });

    const router = await setupTagPickerRouter();
    render(<RouterProvider router={router} />);

    // Wait for the chip-list to render. The chip text format is `<tag><count>`;
    // we assert the count badge shows "1" (not "2"), proving the cascade
    // card was excluded from the baseline aggregation.
    const chip = await screen.findByRole("button", { name: /alpha/ });
    expect(chip).toHaveTextContent("alpha");
    expect(chip).toHaveTextContent("1");
  });
});

// --- Read-path: TagSessionReviewPage `listAllDueCards` honours cascade ----

async function setupTagReviewRouter(tags: string[]) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session/review",
    validateSearch: (search: Record<string, unknown>): { tags: string[] } => {
      const raw = search.tags;
      const arr = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
      const cleaned: string[] = [];
      for (const entry of arr) {
        if (typeof entry === "string" && entry.length > 0) cleaned.push(entry);
      }
      return { tags: cleaned };
    },
    component: function R() {
      const { tags } = reviewRoute.useSearch();
      return <TagSessionReviewPage tags={tags} />;
    },
  });
  const pickerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session",
    component: () => <div>picker</div>,
  });
  const qs = tags.map((t) => `tags=${encodeURIComponent(t)}`).join("&");
  const router = createRouter({
    routeTree: rootRoute.addChildren([pickerRoute, reviewRoute]),
    history: createMemoryHistory({
      initialEntries: [`/tag-session/review${qs ? `?${qs}` : ""}`],
    }),
  });
  await router.load();
  return router;
}

describe("Cascade-key invariant — TagSessionReviewPage `listAllDueCards`", () => {
  beforeEach(async () => {
    await db.open();
    __resetPendingDeletesForTests();
  });
  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
    __resetPendingDeletesForTests();
  });

  it("treats the session as empty when every matching card is cascade-deleted", async () => {
    const deck = await createDeckInDb({ name: "Deck" });
    const c1 = await seedDueCard({ deckId: deck.id, front: "C1", tags: ["alpha"] });

    const store = getPendingDeletes();
    // Pretend the deck got deleted with c1 as a cascade key.
    store.enqueue({
      key: `deck:${deck.id}`,
      cascadeKeys: [`card:${c1.id}`],
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    const router = await setupTagReviewRouter(["alpha"]);
    render(<RouterProvider router={router} />);

    // The runner shows the SessionStart screen first; clicking "Open-ended"
    // calls the loader, which must return no cards because c1 is pending.
    // We assert the empty-message renders rather than the rating-buttons.
    const startBtn = await screen.findByRole("button", { name: /Open-ended/i });
    startBtn.click();

    await screen.findByText(/Keine Cards fällig für diese Tag-Auswahl/i);
  });
});

// --- Read-path: ReviewSessionPage `listDueCardsInDeck` honours cascade ----

async function setupDeckReviewRouter(deckId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId/review",
    component: () => <ReviewSessionPage deckId={deckId} />,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div>deck</div>,
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

describe("Cascade-key invariant — ReviewSessionPage `listDueCardsInDeck`", () => {
  beforeEach(async () => {
    await db.open();
    __resetPendingDeletesForTests();
  });
  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
    __resetPendingDeletesForTests();
  });

  it("excludes pending-deleted child cards from the per-deck loader", async () => {
    const deck = await createDeckInDb({ name: "Deck" });
    const c1 = await seedDueCard({ deckId: deck.id, front: "Front-Pending" });
    await seedDueCard({ deckId: deck.id, front: "Front-Visible" });

    const store = getPendingDeletes();
    store.enqueue({
      key: `card:${c1.id}`,
      label: "Card gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    const router = await setupDeckReviewRouter(deck.id);
    render(<RouterProvider router={router} />);

    const startBtn = await screen.findByRole("button", { name: /Open-ended/i });
    startBtn.click();

    // Only Front-Visible reaches the session queue.
    await screen.findByText("Front-Visible");
    expect(screen.queryByText("Front-Pending")).toBeNull();
  });

  it("treats the session as empty when the deck itself is pending-deleted", async () => {
    const deck = await createDeckInDb({ name: "Deck" });
    await seedDueCard({ deckId: deck.id, front: "Front-Doomed" });

    const store = getPendingDeletes();
    store.enqueue({
      key: `deck:${deck.id}`,
      cascadeKeys: [], // intentionally empty — the deck-level guard alone must short-circuit
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    const router = await setupDeckReviewRouter(deck.id);
    render(<RouterProvider router={router} />);

    const startBtn = await screen.findByRole("button", { name: /Open-ended/i });
    startBtn.click();

    await screen.findByText(/Keine Cards fällig/i);
  });
});
