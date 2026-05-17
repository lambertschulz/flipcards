// ADR-0014 / issue #8 — Deck-Set delete UI regression suite.
//
// Acceptance criteria pinned here:
//   1. Deck-Set-Settings-Page exposes a "Gefahrenzone" affordance that opens
//      a ConfirmDeleteModal naming the cascade rule literally:
//      "Die N enthaltenen Decks bleiben als eigenständige Decks erhalten."
//   2. Confirm enqueues a pending op keyed `deck-set:<id>` and navigates back
//      to "/", at which point the home screen filters the set out of its
//      visible list during the 10s undo window.
//   3. After commit, the deck-set row is gone but member decks survive as
//      lose decks (cascade per ADR-0014 — empty deck-sets stay alive, here
//      we delete a non-empty set and assert its members become lose).
//   4. Removing the last deck from a set via deck-set-detail-page leaves the
//      set itself visible on home (empty-deck-sets-survive invariant).

import "fake-indexeddb/auto";
import { PendingDeleteToasts } from "@/components/pending-delete-toasts";
import { db } from "@/db/database";
import { addDeckToSetInDb, createDeckSetInDb } from "@/db/deck-sets";
import { createDeckInDb } from "@/db/decks";
import { DeckSetDetailPage } from "@/features/deck-set/deck-set-detail-page";
import { DeckSetSettingsPage } from "@/features/deck-set/deck-set-settings-page";
import { HomePage } from "@/features/home/home-page";
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

async function setupDeckSetSettingsRouter(deckSetId: string) {
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
    path: "/deck-set/$deckSetId/settings",
    component: () => <DeckSetSettingsPage deckSetId={deckSetId} />,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/$deckSetId",
    component: () => <div>Deck-Set detail</div>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomePage,
  });
  // Stubs for home-page navigation links so the router doesn't 404 mid-test.
  const deckNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/new",
    component: () => <div>new deck</div>,
  });
  const deckSetNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/new",
    component: () => <div>new deck-set</div>,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div>deck</div>,
  });
  const tagSessionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session",
    component: () => <div>tag-session</div>,
  });
  const settingsAppRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>settings</div>,
  });
  const backupImportRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/backup/import",
    component: () => <div>backup-import</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      detailRoute,
      settingsRoute,
      deckNewRoute,
      deckSetNewRoute,
      deckRoute,
      tagSessionRoute,
      settingsAppRoute,
      backupImportRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [`/deck-set/${deckSetId}/settings`] }),
  });
  await router.load();
  return router;
}

describe("Deck-Set delete via deck-set-settings-page (ADR-0014)", () => {
  beforeEach(async () => {
    await db.open();
    __resetPendingDeletesForTests();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.deckSets.clear();
    await db.reviewStates.clear();
    __resetPendingDeletesForTests();
  });

  it("opens a modal whose body names the cascade rule for member decks", async () => {
    const set = await createDeckSetInDb({ name: "Sprachen" });
    const d1 = await createDeckInDb({ name: "Latein" });
    const d2 = await createDeckInDb({ name: "Griechisch" });
    await addDeckToSetInDb(d1.id, set.id);
    await addDeckToSetInDb(d2.id, set.id);

    const router = await setupDeckSetSettingsRouter(set.id);
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deck-Set löschen" }));

    const dialog = await screen.findByRole("dialog", { name: "Deck-Set löschen?" });
    expect(dialog).toHaveTextContent('„Sprachen"');
    expect(dialog).toHaveTextContent("2");
    // The literal cascade phrase mandated by the acceptance criteria.
    expect(dialog).toHaveTextContent("bleiben als eigenständige Decks");
  });

  it("Confirm enqueues a deck-set pending op, filters it from home, and member decks survive after commit", async () => {
    const set = await createDeckSetInDb({ name: "Sprachen" });
    const d1 = await createDeckInDb({ name: "Latein" });
    const d2 = await createDeckInDb({ name: "Griechisch" });
    await addDeckToSetInDb(d1.id, set.id);
    await addDeckToSetInDb(d2.id, set.id);

    const router = await setupDeckSetSettingsRouter(set.id);
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deck-Set löschen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Endgültig löschen" }));

    // Navigated back to "/" — the home screen now renders.
    await screen.findByRole("heading", { name: "Decks" });

    // Pending op exists with the canonical key shape.
    const ops = getPendingDeletes().list();
    expect(ops).toHaveLength(1);
    expect(ops[0].key).toBe(`deck-set:${set.id}`);

    // Deck-Set is filtered from home during the pending window.
    expect(screen.queryByText("Sprachen")).toBeNull();
    // Member decks remain visible on home (under "Lose Decks" once filter
    // strips the parent set — or under the set, depending on whether the
    // filter on the *set itself* changes the grouping). Either way both
    // deck names must be reachable in the home DOM.
    await screen.findByText("Latein");
    await screen.findByText("Griechisch");

    // IndexedDB untouched until commit fires.
    expect(await db.deckSets.get(set.id)).toBeDefined();

    // Force commit.
    await act(async () => {
      await getPendingDeletes().flushAll();
    });

    // Deck-Set is gone, member decks survive as lose decks.
    expect(await db.deckSets.get(set.id)).toBeUndefined();
    const dRow1 = await db.decks.get(d1.id);
    const dRow2 = await db.decks.get(d2.id);
    expect(dRow1).toBeDefined();
    expect(dRow2).toBeDefined();
    expect(dRow1?.deckSetId).toBeUndefined();
    expect(dRow2?.deckSetId).toBeUndefined();
  });
});

// --- Empty Deck-Set survives removal of last member -------------------------

async function setupDeckSetDetailRouter(deckSetId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/$deckSetId",
    component: () => <DeckSetDetailPage deckSetId={deckSetId} />,
  });
  const setSettingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/$deckSetId/settings",
    component: () => <div>set settings</div>,
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/$deckId",
    component: () => <div>deck</div>,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomePage,
  });
  const deckNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck/new",
    component: () => <div>new deck</div>,
  });
  const deckSetNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/deck-set/new",
    component: () => <div>new deck-set</div>,
  });
  const tagSessionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tag-session",
    component: () => <div>tag-session</div>,
  });
  const settingsAppRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>settings</div>,
  });
  const backupImportRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/backup/import",
    component: () => <div>backup-import</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      detailRoute,
      setSettingsRoute,
      deckRoute,
      deckNewRoute,
      deckSetNewRoute,
      tagSessionRoute,
      settingsAppRoute,
      backupImportRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [`/deck-set/${deckSetId}`] }),
  });
  await router.load();
  return router;
}

describe("Empty Deck-Sets survive removal of their last member (ADR-0014)", () => {
  beforeEach(async () => {
    await db.open();
    __resetPendingDeletesForTests();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.deckSets.clear();
    await db.reviewStates.clear();
    __resetPendingDeletesForTests();
  });

  it("removing the last member deck leaves the set intact and visible on home", async () => {
    const set = await createDeckSetInDb({ name: "Solo-Set" });
    const lone = await createDeckInDb({ name: "Einsam" });
    await addDeckToSetInDb(lone.id, set.id);

    const router = await setupDeckSetDetailRouter(set.id);
    render(<RouterProvider router={router} />);

    // Wait for the member row to render then click "Entfernen".
    await screen.findByText("Einsam");
    fireEvent.click(screen.getByRole("button", { name: "Deck Einsam aus Set entfernen" }));

    // The deck is detached but the set row in IndexedDB remains.
    await waitFor(async () => {
      const row = await db.decks.get(lone.id);
      expect(row?.deckSetId).toBeUndefined();
    });
    expect(await db.deckSets.get(set.id)).toBeDefined();

    // Render the home page in a *fresh* router and assert the empty set is
    // still listed there (with 0 decks) — this pins the "empty deck-set
    // survives" invariant at the UI layer, not just the DB layer.
    const homeRoot = createRootRoute({ component: () => <Outlet /> });
    const homeIndex = createRoute({
      getParentRoute: () => homeRoot,
      path: "/",
      component: HomePage,
    });
    const homeDeckRoute = createRoute({
      getParentRoute: () => homeRoot,
      path: "/deck/$deckId",
      component: () => <div>deck</div>,
    });
    const homeDeckSetRoute = createRoute({
      getParentRoute: () => homeRoot,
      path: "/deck-set/$deckSetId",
      component: () => <div>deck-set</div>,
    });
    const homeDeckNewRoute = createRoute({
      getParentRoute: () => homeRoot,
      path: "/deck/new",
      component: () => <div>new deck</div>,
    });
    const homeDeckSetNewRoute = createRoute({
      getParentRoute: () => homeRoot,
      path: "/deck-set/new",
      component: () => <div>new deck-set</div>,
    });
    const homeTagSession = createRoute({
      getParentRoute: () => homeRoot,
      path: "/tag-session",
      component: () => <div>tag-session</div>,
    });
    const homeSettings = createRoute({
      getParentRoute: () => homeRoot,
      path: "/settings",
      component: () => <div>settings</div>,
    });
    const homeBackupImport = createRoute({
      getParentRoute: () => homeRoot,
      path: "/backup/import",
      component: () => <div>backup-import</div>,
    });
    const homeRouter = createRouter({
      routeTree: homeRoot.addChildren([
        homeIndex,
        homeDeckRoute,
        homeDeckSetRoute,
        homeDeckNewRoute,
        homeDeckSetNewRoute,
        homeTagSession,
        homeSettings,
        homeBackupImport,
      ]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await homeRouter.load();
    render(<RouterProvider router={homeRouter} />);

    await screen.findByText("Solo-Set");
  });
});

// --- Corpse-page invariant: navigating to /deck-set/<id> after the delete
// was enqueued must NOT render the doomed entity. Round-4 strengthens this
// to a page-level redirect (mirrors deck-detail-page / card-edit-page /
// card-create-page) — write-paths (the add/remove member-deck buttons)
// would otherwise fire against a doomed set in the gap between mount and
// click. The page now redirects home; the home screen filters the set
// out of its visible list during the 10s undo window.

describe("Deck-Set detail page hides pending-deleted set (ADR-0014 round 4)", () => {
  beforeEach(async () => {
    await db.open();
    __resetPendingDeletesForTests();
  });

  afterEach(async () => {
    await db.cards.clear();
    await db.decks.clear();
    await db.deckSets.clear();
    await db.reviewStates.clear();
    __resetPendingDeletesForTests();
  });

  it("redirects to home when navigating directly to /deck-set/<id> while a pending-delete op for that set is live", async () => {
    const set = await createDeckSetInDb({ name: "Sprachen-Doomed" });
    const member = await createDeckInDb({ name: "Latein" });
    await addDeckToSetInDb(member.id, set.id);

    // Enqueue the pending-delete op BEFORE the route mounts — mimics the
    // "stale tab / browser back" scenario the brief calls out: the user
    // confirmed the delete on settings-page, then before the 10s window
    // expires they navigate back into the now-doomed set via direct URL.
    getPendingDeletes().enqueue({
      key: `deck-set:${set.id}`,
      label: "Deck-Set entfernt",
      commit: async () => {},
      restore: async () => {},
    });

    const router = await setupDeckSetDetailRouter(set.id);
    render(<RouterProvider router={router} />);

    // The redirect effect lands us on the home page — neither the doomed
    // set's name nor its member deck may surface anywhere in the DOM
    // (home filters the set out via `useVisibleDeckSets`, and member
    // decks of a pending-deleted set still render as lose decks on home;
    // we therefore only assert the doomed set name is absent).
    await waitFor(() => expect(screen.queryByText("Sprachen-Doomed")).toBeNull());
  });
});
