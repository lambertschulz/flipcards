import { type PendingDeletesStore, getPendingDeletes } from "@/lib/pending-deletes";
import { usePendingDeletes, usePendingDeletesLifecycle } from "@/lib/pending-deletes-react";
import { useEffect, useState } from "react";

/**
 * Stack of pending-delete toasts. Each toast shows the op label, a countdown
 * (rounded seconds, clamped at 0), and an "Rückgängig" button.
 *
 * Mount once in the root layout. The component does its own ticking via a
 * 250ms interval — the underlying store already auto-commits at the right
 * time; the interval is purely cosmetic so the countdown updates visibly.
 */
export function PendingDeleteToasts({
  store = getPendingDeletes(),
}: { store?: PendingDeletesStore } = {}) {
  usePendingDeletesLifecycle(store);
  const ops = usePendingDeletes(store);
  // Tick every 250ms to refresh the countdown. Doesn't drive any commits.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (ops.length === 0) return;
    const h = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(h);
  }, [ops.length]);

  if (ops.length === 0) return null;

  const visible = ops.filter((o) => o.state === "pending" || o.state === "failed");
  if (visible.length === 0) return null;

  return (
    <output
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {visible.map((op) => {
        const remainingMs = Math.max(0, op.commitsAt - Date.now());
        const remainingSec = Math.ceil(remainingMs / 1000);
        const failed = op.state === "failed";
        return (
          <div
            key={op.id}
            role={failed ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-md ${
              failed
                ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            }`}
          >
            <span className="flex-1 truncate">
              {failed ? `Löschen fehlgeschlagen: ${op.error ?? "unbekannter Fehler"}` : op.label}
              {!failed && remainingSec > 0 ? (
                <span className="ml-2 text-slate-500 dark:text-slate-400">({remainingSec}s)</span>
              ) : null}
            </span>
            {!failed ? (
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:hover:bg-slate-800"
                onClick={() => {
                  void store.undo(op.id);
                }}
              >
                Rückgängig
              </button>
            ) : null}
          </div>
        );
      })}
    </output>
  );
}
