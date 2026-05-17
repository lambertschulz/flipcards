import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { putReviewState } from "@/db/review-states";
import { INITIAL_REVIEW_STATE } from "@/domain/sm2";
import { TagPickerPage } from "@/features/tag-session/tag-picker-page";
import { TagSessionReviewPage } from "@/features/tag-session/tag-session-review-page";
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

const DAY_MS = 24 * 60 * 60 * 1000;

async function setupRouter(initialPath = "/tag-session") {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const pickerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session",
    component: TagPickerPage,
  });
  const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session/review",
    validateSearch: (search: Record<string, unknown>): { tags: string[] } => {
      const raw = search.tags;
      const arr = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
      const cleaned: string[] = [];
      const seen = new Set<string>();
      for (const entry of arr) {
        if (typeof entry !== "string") continue;
        const trimmed = entry.trim();
        if (trimmed.length === 0) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        cleaned.push(trimmed);
      }
      return { tags: cleaned };
    },
    component: function TagReviewRouteComponent() {
      const { tags } = reviewRoute.useSearch();
      return <TagSessionReviewPage tags={tags} />;
    },
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pickerRoute, reviewRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await router.load();
  return router;
}

async function clickAndFlush(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

describe("TagPickerPage", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  it("renders the empty-state when no card carries a tag", async () => {
    const deck = await createDeckInDb({ name: "Untagged" });
    await createCardInDb({ deckId: deck.id, front: "a", back: "b" });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText(/Du hast noch keine Tags vergeben/i)).toBeInTheDocument();
    });
  });

  it("aggregates tags across decks and shows due-counts as chips", async () => {
    const deckA = await createDeckInDb({ name: "Deck A" });
    const deckB = await createDeckInDb({ name: "Deck B" });
    await createCardInDb({ deckId: deckA.id, front: "1", back: "1", tags: ["prüfung", "medizin"] });
    await createCardInDb({ deckId: deckA.id, front: "2", back: "2", tags: ["prüfung"] });
    await createCardInDb({
      deckId: deckB.id,
      front: "3",
      back: "3",
      tags: ["medizin", "anatomie"],
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const prüfungChip = await screen.findByRole("button", { name: /prüfung/i });
    expect(prüfungChip).toHaveTextContent("2");
    const medizinChip = screen.getByRole("button", { name: /medizin/i });
    expect(medizinChip).toHaveTextContent("2");
    const anatomieChip = screen.getByRole("button", { name: /anatomie/i });
    expect(anatomieChip).toHaveTextContent("1");
  });

  it("excludes cards that aren't due from the tag-counts", async () => {
    const deck = await createDeckInDb({ name: "D" });
    const c1 = await createCardInDb({ deckId: deck.id, front: "1", back: "1", tags: ["x"] });
    const c2 = await createCardInDb({ deckId: deck.id, front: "2", back: "2", tags: ["x"] });
    // Push c2 into the future — only c1 should be counted under tag "x".
    await putReviewState(c2.id, { ...INITIAL_REVIEW_STATE, nextDue: Date.now() + DAY_MS });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const chip = await screen.findByRole("button", { name: /^x/i });
    expect(chip).toHaveTextContent("1");
    expect(c1.id).toBeTruthy();
  });

  it("updates the live AND-count on other chips when a tag is selected", async () => {
    const deck = await createDeckInDb({ name: "D" });
    // Two cards have both `prüfung` and `medizin`, one only `prüfung`, one
    // only `medizin`. Selecting `prüfung` should drop `medizin`'s shown
    // count from 3 to 2 (the AND-intersection).
    await createCardInDb({ deckId: deck.id, front: "1", back: "1", tags: ["prüfung", "medizin"] });
    await createCardInDb({ deckId: deck.id, front: "2", back: "2", tags: ["prüfung", "medizin"] });
    await createCardInDb({ deckId: deck.id, front: "3", back: "3", tags: ["prüfung"] });
    await createCardInDb({ deckId: deck.id, front: "4", back: "4", tags: ["medizin"] });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const prüfungChip = await screen.findByRole("button", { name: /prüfung/i });
    const medizinChipBefore = screen.getByRole("button", { name: /medizin/i });
    expect(prüfungChip).toHaveTextContent("3");
    expect(medizinChipBefore).toHaveTextContent("3");

    await clickAndFlush(prüfungChip);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /medizin/i })).toHaveTextContent("2");
    });
  });

  it("disables chips whose AND-intersection with the selection is empty", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "1", back: "1", tags: ["a"] });
    await createCardInDb({ deckId: deck.id, front: "2", back: "2", tags: ["b"] });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const aChip = await screen.findByRole("button", { name: /^a/i });
    await clickAndFlush(aChip);

    await waitFor(() => {
      const bChip = screen.getByRole("button", { name: /^b/i });
      expect(bChip).toBeDisabled();
    });
  });

  it("the start button is disabled until at least one tag is selected and the count is > 0", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "1", back: "1", tags: ["x"] });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const startBtn = await screen.findByRole("button", { name: /Session starten/i });
    expect(startBtn).toBeDisabled();

    const xChip = screen.getByRole("button", { name: /^x/i });
    await clickAndFlush(xChip);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Session starten/i })).not.toBeDisabled();
    });
  });

  it("navigates to /tag-session/review with the selected tags in the search params on start", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "1", back: "1", tags: ["prüfung"] });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByRole("button", { name: /^prüfung/i }));
    await clickAndFlush(await screen.findByRole("button", { name: /Session starten/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/tag-session/review");
      expect(router.state.location.search).toMatchObject({ tags: ["prüfung"] });
    });
  });

  it("round-trips a tag whose name contains a comma without splitting it", async () => {
    // Regression: `normalizeTag` allows commas inside a tag (only whitespace
    // is collapsed), so a tag like "cardio,renal" is a single valid tag.
    // A comma-joined wire format would mis-split it on the receiving side
    // and break the AND-filter. We serialise as an array instead.
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({
      deckId: deck.id,
      front: "1",
      back: "1",
      tags: ["cardio,renal"],
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    // The chip itself must show the comma-containing tag as a single chip.
    const chip = await screen.findByRole("button", { name: /cardio,renal/i });
    expect(chip).toHaveTextContent("1");

    await clickAndFlush(chip);
    await clickAndFlush(await screen.findByRole("button", { name: /Session starten/i }));

    // Navigation lands on /tag-session/review with the comma-containing tag
    // intact as a single element of the `tags` array.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/tag-session/review");
      expect(router.state.location.search).toMatchObject({ tags: ["cardio,renal"] });
    });

    // And the review page sees the same tag — its title prints it verbatim.
    await screen.findByRole("button", { name: /Open-ended/i });
    expect(screen.getByRole("heading", { name: /cardio,renal/ })).toBeInTheDocument();
  });
});

describe("TagSessionReviewPage", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  it("only enqueues due cards that carry all selected tags (deck-übergreifend, AND)", async () => {
    const deckA = await createDeckInDb({ name: "A" });
    const deckB = await createDeckInDb({ name: "B" });
    // Match: both tags.
    await createCardInDb({
      deckId: deckA.id,
      front: "MATCH-A",
      back: "back",
      tags: ["prüfung", "medizin"],
    });
    await createCardInDb({
      deckId: deckB.id,
      front: "MATCH-B",
      back: "back",
      tags: ["prüfung", "medizin"],
    });
    // No match: only one of the tags.
    await createCardInDb({ deckId: deckA.id, front: "NO-A", back: "back", tags: ["prüfung"] });
    await createCardInDb({ deckId: deckB.id, front: "NO-B", back: "back", tags: ["medizin"] });

    const router = await setupRouter("/tag-session/review?tags=pr%C3%BCfung&tags=medizin");
    render(<RouterProvider router={router} />);

    // Start an Open-ended session, then verify the queue size via the
    // footer "1 / 2 Cards" indicator.
    await clickAndFlush(await screen.findByRole("button", { name: /Open-ended/i }));

    await screen.findByRole("button", { name: /Vorderseite/i });
    expect(screen.getByText(/1 \/ 2 Cards/)).toBeInTheDocument();
  });

  it("shows the empty-state when the AND-intersection is empty", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "1", back: "1", tags: ["alpha"] });

    const router = await setupRouter("/tag-session/review?tags=beta");
    // single-string `tags` is also accepted by the validator (deep-link with
    // exactly one tag arrives as `?tags=foo`, not as a one-element array).
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByRole("button", { name: /Open-ended/i }));

    await waitFor(() => {
      expect(screen.getByText(/Keine Cards fällig/i)).toBeInTheDocument();
    });
  });
});
