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
  return ops.some((o) => o.key === key && o.state === "pending");
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
