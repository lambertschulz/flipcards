import { applyUpdate, isUpdateReady, onUpdateReady } from "@/lib/pwa/register";
import { useEffect, useState } from "react";

/**
 * Surfaces a "Neue Version verfügbar"-Toast when the service worker has a
 * new build waiting. Clicking "Neu laden" calls `applyUpdate()` which
 * skips-waiting on the new SW; the page then reloads automatically when
 * the controller changes.
 *
 * Visual language matches `pending-delete-toasts.tsx` — flat row, sits at
 * the bottom of the viewport, polite live-region semantics. ADR-0009
 * rules out a celebratory install-banner UI; this toast is the *one*
 * piece of PWA chrome we do show, and only because the update flow would
 * otherwise be invisible to the user (issue #16 + #25 acceptance).
 *
 * Mounted once from the root layout. Self-dismisses after the user
 * triggers the reload (the page goes away with it).
 */
export function PwaUpdateToast() {
  const [ready, setReady] = useState<boolean>(() => isUpdateReady());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    return onUpdateReady(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <output
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
    >
      {/* `<output>` wrapper above already supplies live-region semantics —
          a redundant role="status" here trips biome's a11y rule. */}
      <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <span className="flex-1">Neue Version verfügbar.</span>
        <button
          type="button"
          disabled={applying}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
          onClick={() => {
            setApplying(true);
            void applyUpdate();
          }}
        >
          {applying ? "Lade neu …" : "Neu laden"}
        </button>
      </div>
    </output>
  );
}
