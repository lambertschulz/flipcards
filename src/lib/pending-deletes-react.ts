import { type PendingDeletesStore, type PendingOp, getPendingDeletes } from "@/lib/pending-deletes";
import { useEffect, useSyncExternalStore } from "react";

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
