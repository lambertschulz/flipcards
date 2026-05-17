import { db } from "@/db/database";
import type { CardRow, DeckRow, DeckSetRow } from "@/db/database";
import { type PendingDeletesStore, type PendingOp, getPendingDeletes } from "@/lib/pending-deletes";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * React hook returning the current list of pending-delete ops, re-rendering
 * whenever the store changes. Uses `useSyncExternalStore` so concurrent
 * rendering stays consistent — every render sees a single store snapshot.
 */
export function usePendingDeletes(
  store: PendingDeletesStore = getPendingDeletes(),
): readonly PendingOp[] {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.list(),
    () => store.list(),
  );
}

/**
 * `true` if `key` currently has a pending-delete op. Use this in list
 * components to filter out optimistically-deleted rows.
 */
export function useIsPendingDelete(
  key: string,
  store: PendingDeletesStore = getPendingDeletes(),
): boolean {
  const ops = usePendingDeletes(store);
  // Match `store.isPending`:
  // - covers both `pending` (hold window) and `committing` (commit in flight)
  //   so the row doesn't briefly flash back between those two states;
  // - matches against the op's full key-set so cascade descendants
  //   (`card:<id>` keys on a deck-delete op) hide everywhere too. This is the
  //   canonical hide predicate — callers must never reach into `op.state` or
  //   `op.key` directly.
  return ops.some(
    (o) => (o.state === "pending" || o.state === "committing") && o.keys.some((k) => k === key),
  );
}

/**
 * Hook: installs the lifecycle listeners (visibilitychange + pagehide) once
 * per component lifetime. Mount it in the root layout.
 */
export function usePendingDeletesLifecycle(store: PendingDeletesStore = getPendingDeletes()): void {
  useEffect(() => {
    return store.installLifecycleListeners();
  }, [store]);
}

// ---------------------------------------------------------------------------
// Visibility-filtered Dexie hooks — the *only* sanctioned way to read
// `decks` / `deckSets` / `cards` from Dexie inside a feature component.
//
// ADR-0014 invariant (mandatory architectural enforcement):
//   No read-model anywhere in the app may surface a row whose pending-delete
//   op is in `pending` or `committing` state — neither the directly-deleted
//   entity nor any cascade descendant.
//
// Each pair (`useVisibleX` for entity-by-id, `useVisibleXs` for list/picker
// queries) calls `usePendingDeletes()` internally so a caller cannot forget
// to subscribe to the store — the moment an op flips state, every component
// using these hooks re-renders.
//
// To enforce the invariant we maintain a `git grep` audit (see
// `pending-deletes-react.audit.test.ts`): every `useLiveQuery` call against
// `db.decks` / `db.deckSets` / `db.cards` outside this file MUST go through
// one of the hooks below. New callsites that re-introduce a raw
// `useLiveQuery(() => db.decks. …)` will fail that test.
// ---------------------------------------------------------------------------

// `dexie-react-hooks`' `useLiveQuery` returns `T | undefined` while the query
// is in flight; we propagate that to the caller so the loading state survives
// our filter. A null default keeps callers' existing `loading vs not-found`
// distinction working (some pages pass `null` for "still loading").

// Match Dexie's `useLiveQuery` deps type (mutable `any[]`).
type LiveQueryDeps = unknown[];

/**
 * Read a single Deck by id, returning `undefined` when its `deck:<id>` op
 * is in the pending-delete window. Use this on every detail/settings page.
 */
export function useVisibleDeck(
  id: string,
  fallback: DeckRow | null = null,
): DeckRow | null | undefined {
  // Subscribe so the component re-renders when the pending-deletes store
  // transitions (pending → committing → committed / undone). The hide
  // predicate below reads through `store.isPending`, which already covers
  // both `pending` and `committing`.
  usePendingDeletes();
  const store = getPendingDeletes();
  const row = useLiveQuery(() => db.decks.get(id), [id], fallback);
  if (row && store.isPending(`deck:${id}`)) return undefined;
  return row;
}

/**
 * Read a single Deck-Set by id, returning `undefined` when its
 * `deck-set:<id>` op is in the pending-delete window.
 */
export function useVisibleDeckSet(
  id: string,
  fallback: DeckSetRow | null = null,
): DeckSetRow | null | undefined {
  usePendingDeletes();
  const store = getPendingDeletes();
  const row = useLiveQuery(() => db.deckSets.get(id), [id], fallback);
  if (row && store.isPending(`deck-set:${id}`)) return undefined;
  return row;
}

/**
 * Read a single Card by id, returning `undefined` when either its own
 * `card:<id>` op or its parent `deck:<deckId>` op is in the pending-delete
 * window (the deck-delete cascade marks each child `card:<id>` too, but we
 * also defend against a caller that enqueued without the cascade keys).
 */
export function useVisibleCard(
  id: string,
  fallback: CardRow | null = null,
): CardRow | null | undefined {
  usePendingDeletes();
  const store = getPendingDeletes();
  const row = useLiveQuery(() => db.cards.get(id), [id], fallback);
  if (!row) return row;
  if (store.isPending(`card:${id}`)) return undefined;
  if (store.isPending(`deck:${row.deckId}`)) return undefined;
  return row;
}

/**
 * Read a list of Decks via a Dexie query thunk, then filter out every row
 * whose `deck:<id>` is in the pending-delete window. Use this for every
 * list/picker that touches `db.decks`.
 *
 * The query thunk and `deps` are passed through to `useLiveQuery` verbatim,
 * so existing call patterns (`() => db.decks.orderBy("name").toArray()`,
 * `() => db.decks.where("deckSetId").equals(id).toArray()`, etc.) work
 * unchanged. The `initialValue` overload is preserved: passing `[]` keeps
 * the return type as `DeckRow[]` (no `undefined`) and matches `useLiveQuery`'s
 * existing surface.
 */
export function useVisibleDecks(
  query: () => Promise<DeckRow[]> | DeckRow[],
  deps?: LiveQueryDeps,
): DeckRow[] | undefined;
export function useVisibleDecks(
  query: () => Promise<DeckRow[]> | DeckRow[],
  deps: LiveQueryDeps,
  initialValue: DeckRow[],
): DeckRow[];
export function useVisibleDecks(
  query: () => Promise<DeckRow[]> | DeckRow[],
  deps: LiveQueryDeps = [],
  initialValue?: DeckRow[],
): DeckRow[] | undefined {
  const ops = usePendingDeletes();
  const store = getPendingDeletes();
  const rows = useLiveQuery(query, deps, initialValue as DeckRow[] | undefined);
  // Memoise on the underlying `rows` reference (stable across renders while
  // Dexie's query result hasn't changed) and the `ops` snapshot (stable
  // across renders while the pending-deletes store hasn't changed). Without
  // this, every render produced a fresh `.filter()` array — and any
  // downstream `useLiveQuery([visibleDecks])` / `useMemo(..., [visibleDecks])`
  // tore down on every render. See PR #43 review feedback.
  //
  // `ops` is listed in the deps even though `store.isPending` is what the
  // filter actually reads: `ops` is the snapshot proxy that the live store
  // hands us, and re-computing the memo when it changes is the only signal
  // that "isPending now answers differently" (the store mutates internally
  // and `store.isPending` reads from those internals).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ops` is the store-snapshot proxy that signals when `store.isPending` answers differently.
  return useMemo(() => {
    if (rows === undefined) return undefined;
    return rows.filter((d) => !store.isPending(`deck:${d.id}`));
  }, [rows, ops, store]);
}

/**
 * Read a list of Deck-Sets via a Dexie query thunk, then filter out every
 * row whose `deck-set:<id>` is in the pending-delete window.
 */
export function useVisibleDeckSets(
  query: () => Promise<DeckSetRow[]> | DeckSetRow[],
  deps?: LiveQueryDeps,
): DeckSetRow[] | undefined;
export function useVisibleDeckSets(
  query: () => Promise<DeckSetRow[]> | DeckSetRow[],
  deps: LiveQueryDeps,
  initialValue: DeckSetRow[],
): DeckSetRow[];
export function useVisibleDeckSets(
  query: () => Promise<DeckSetRow[]> | DeckSetRow[],
  deps: LiveQueryDeps = [],
  initialValue?: DeckSetRow[],
): DeckSetRow[] | undefined {
  const ops = usePendingDeletes();
  const store = getPendingDeletes();
  const rows = useLiveQuery(query, deps, initialValue as DeckSetRow[] | undefined);
  // See `useVisibleDecks` for why we memoise — without this, every render
  // returns a fresh `.filter()` array, destabilising downstream deps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ops` is the store-snapshot proxy that signals when `store.isPending` answers differently.
  return useMemo(() => {
    if (rows === undefined) return undefined;
    return rows.filter((s) => !store.isPending(`deck-set:${s.id}`));
  }, [rows, ops, store]);
}

/**
 * Read a list of Cards via a Dexie query thunk, then filter out every row
 * whose `card:<id>` *or* parent `deck:<deckId>` is in the pending-delete
 * window. The deck-delete cascade already stamps `card:<id>` for each
 * child, but the additional `deck:<deckId>` check is a defence in depth
 * against future callers that enqueue without cascade keys.
 */
export function useVisibleCards(
  query: () => Promise<CardRow[]> | CardRow[],
  deps?: LiveQueryDeps,
): CardRow[] | undefined;
export function useVisibleCards(
  query: () => Promise<CardRow[]> | CardRow[],
  deps: LiveQueryDeps,
  initialValue: CardRow[],
): CardRow[];
export function useVisibleCards(
  query: () => Promise<CardRow[]> | CardRow[],
  deps: LiveQueryDeps = [],
  initialValue?: CardRow[],
): CardRow[] | undefined {
  const ops = usePendingDeletes();
  const store = getPendingDeletes();
  const rows = useLiveQuery(query, deps, initialValue as CardRow[] | undefined);
  // See `useVisibleDecks` for why we memoise — without this, every render
  // returns a fresh `.filter()` array, which destabilises downstream
  // `useLiveQuery([cards])` and `useMemo(..., [cards])` deps and creates a
  // re-subscribe loop. The specific instance that triggered PR #43 review
  // feedback was the deck-detail page's reviewStates query.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ops` is the store-snapshot proxy that signals when `store.isPending` answers differently.
  return useMemo(() => {
    if (rows === undefined) return undefined;
    return rows.filter(
      (c) => !store.isPending(`card:${c.id}`) && !store.isPending(`deck:${c.deckId}`),
    );
  }, [rows, ops, store]);
}
